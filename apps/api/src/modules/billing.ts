import { config } from "../config.js";
import { prisma } from "../db.js";
import { ApiError, invalid, notFound } from "../lib/errors.js";

/** Depois desse atraso a produção é bloqueada; o pagamento libera de novo na próxima sincronização. */
export const OVERDUE_GRACE_MS = 7 * 86_400_000;

const PAID = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);

export const billingEnabled = () => !!config.ASAAS_API_KEY;

interface AsaasPayment {
  status: string;
  dueDate: string;
  invoiceUrl: string;
}

async function asaas<T>(method: string, path: string, body?: object): Promise<T> {
  if (!config.ASAAS_API_KEY) throw new ApiError("internal_error", "Cobrança indisponível no momento.");
  const res = await fetch(`${config.ASAAS_API_URL.replace(/\/$/, "")}${path}`, {
    method,
    headers: { "content-type": "application/json", access_token: config.ASAAS_API_KEY, "user-agent": "Simvio" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { errors?: { description?: string }[] };
  if (res.status === 404) throw notFound("Registro no Asaas");
  if (res.status === 400) throw invalid(data.errors?.[0]?.description ?? "Dados de cobrança recusados pelo Asaas.");
  if (!res.ok) {
    // Nunca registrar a chave nem o corpo enviado (contém CPF/CNPJ).
    console.error(JSON.stringify({ level: "error", msg: "falha no Asaas", method, path: path.split("?")[0], status: res.status }));
    throw new ApiError("internal_error", "Cobrança indisponível no momento. Tente novamente em instantes.");
  }
  return data;
}

/** Data de hoje no fuso de Brasília, no formato do Asaas. */
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const brDate = (d: string) => new Date(`${d}T00:00:00-03:00`);

export interface CheckoutInput {
  plan_code: string;
  cpf_cnpj?: string;
  name?: string;
  email?: string;
}

/**
 * Assina ou troca de plano. Troca vale na próxima fatura: só o valor muda no Asaas,
 * e os limites do novo plano entram na hora se a assinatura já estiver paga.
 */
export async function checkout(orgId: string, input: CheckoutInput) {
  const plan = await prisma.plan.findFirst({ where: { code: input.plan_code, active: true } });
  if (!plan) throw notFound("Plano");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  let customerId = org.asaasCustomerId;
  if (input.cpf_cnpj && input.name && input.email) {
    const customer = { name: input.name, cpfCnpj: input.cpf_cnpj, email: input.email, externalReference: `simvio:org:${orgId}` };
    customerId = customerId
      ? (await asaas<{ id: string }>("PUT", `/customers/${customerId}`, customer)).id
      : (await asaas<{ id: string }>("POST", "/customers", customer)).id;
    await prisma.organization.update({ where: { id: orgId }, data: { asaasCustomerId: customerId } });
  }
  if (!customerId) throw invalid("Informe CPF/CNPJ, nome e e-mail de cobrança.", { field: "cpf_cnpj" });

  const value = plan.priceCents / 100;
  const description = `Simvio — plano ${plan.name}`;
  let subscriptionId = org.asaasSubscriptionId;
  if (subscriptionId) {
    await asaas("PUT", `/subscriptions/${subscriptionId}`, { value, description, updatePendingPayments: true });
    await prisma.$transaction([
      prisma.organization.update({ where: { id: orgId }, data: { billingPlanCode: plan.code } }),
      prisma.subscription.updateMany({ where: { organizationId: orgId, status: "active" }, data: { planId: plan.id } }),
    ]);
  } else {
    const sub = await asaas<{ id: string }>("POST", "/subscriptions", {
      customer: customerId,
      billingType: "UNDEFINED",
      cycle: "MONTHLY",
      nextDueDate: today(),
      value,
      description,
      externalReference: `simvio:org:${orgId}`,
    });
    subscriptionId = sub.id;
    await prisma.organization.update({ where: { id: orgId }, data: { asaasSubscriptionId: sub.id, billingPlanCode: plan.code } });
  }
  await syncBilling(orgId);
  const after = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { billingInvoiceUrl: true } });
  return { plan_code: plan.code, invoice_url: after.billingInvoiceUrl };
}

/** Cancela no Asaas (some a cobrança futura) e mantém o acesso até o fim do período já pago. */
export async function cancelBilling(orgId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, include: { subscription: true } });
  if (!org.asaasSubscriptionId) throw invalid("Não há assinatura pelo Asaas para cancelar.");
  await asaas("DELETE", `/subscriptions/${org.asaasSubscriptionId}`);
  const endsAt = org.subscription?.currentPeriodEnd ?? new Date();
  await prisma.organization.update({
    where: { id: orgId },
    data: { asaasSubscriptionId: null, billingInvoiceUrl: null, billingOverdueSince: null, billingEndsAt: endsAt },
  });
  return { ends_at: endsAt.toISOString() };
}

/**
 * Lê a assinatura e as cobranças no Asaas e aplica o resultado. Idempotente e independente
 * da ordem dos webhooks, que só servem de gatilho.
 */
export async function syncBilling(orgId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, include: { subscription: true } });
  const subId = org.asaasSubscriptionId;
  if (!subId) return;

  const sub = await asaas<{ status: string; deleted: boolean }>("GET", `/subscriptions/${subId}`).catch((e: unknown) => {
    if (e instanceof ApiError && e.code === "not_found") return null;
    throw e;
  });
  // shortcut: lê as últimas 100 cobranças; paginar só se uma assinatura passar de 8 anos.
  const payments = sub ? (await asaas<{ data: AsaasPayment[] }>("GET", `/subscriptions/${subId}/payments?limit=100`)).data : [];
  const byDue = [...payments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const paid = byDue.filter((p) => PAID.has(p.status));
  const overdue = byDue.find((p) => p.status === "OVERDUE");
  const open = byDue.find((p) => p.status === "OVERDUE" || p.status === "PENDING");
  const lastPaid = paid.at(-1);

  const periodEnd = lastPaid ? brDate(lastPaid.dueDate) : null;
  periodEnd?.setMonth(periodEnd.getMonth() + 1);
  const removed = !sub || sub.deleted || sub.status !== "ACTIVE";

  await prisma.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: orgId },
      data: removed
        ? { asaasSubscriptionId: null, billingInvoiceUrl: null, billingOverdueSince: null, billingEndsAt: periodEnd ?? org.subscription?.currentPeriodEnd ?? new Date() }
        : {
            billingInvoiceUrl: open?.invoiceUrl ?? null,
            billingOverdueSince: overdue ? brDate(overdue.dueDate) : null,
            ...(lastPaid ? { billingEndsAt: null } : {}),
          },
    });
    if (!lastPaid || !org.billingPlanCode) return;
    const plan = await tx.plan.findUniqueOrThrow({ where: { code: org.billingPlanCode } });
    const data = { planId: plan.id, status: "active" as const, currentPeriodEnd: periodEnd, notes: "Cobrança pelo Asaas" };
    await tx.subscription.upsert({ where: { organizationId: orgId }, update: data, create: { organizationId: orgId, ...data } });
  });
}

/** Webhook do Asaas. A conta é compartilhada com outros sistemas: o que não for da Simvio é ignorado. */
export async function handleAsaasEvent(body: { payment?: { subscription?: string }; subscription?: { id?: string } }) {
  const subId = body.payment?.subscription ?? body.subscription?.id;
  if (!subId) return false;
  const org = await prisma.organization.findUnique({ where: { asaasSubscriptionId: subId }, select: { id: true } });
  if (!org) return false;
  await syncBilling(org.id);
  return true;
}
