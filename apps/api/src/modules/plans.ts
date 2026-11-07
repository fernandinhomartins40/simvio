import { prisma, type Tx } from "../db.js";
import { OVERDUE_GRACE_MS } from "./billing.js";

/** Planos de referência do PRD §3 (sujeitos a validação comercial). */
export const DEFAULT_PLANS = [
  { code: "essencial", name: "Essencial", priceCents: 7900, maxLiveApplications: 1, maxDevices: 1 },
  { code: "profissional", name: "Profissional", priceCents: 17900, maxLiveApplications: 5, maxDevices: 2 },
  { code: "agencia", name: "Agência", priceCents: 39900, maxLiveApplications: 20, maxDevices: 5 },
] as const;

/**
 * Sem assinatura ativa a organização fica em sandbox: pode testar (ambiente de teste e um
 * aparelho), mas não habilita produção. A assinatura vem do Asaas ou é definida à mão pela administração.
 */
export const SANDBOX_ENTITLEMENTS = { maxLiveApplications: 0, maxDevices: 1 };

export interface Entitlements {
  planCode: string | null;
  planName: string;
  status: "sandbox" | "active" | "suspended" | "cancelled";
  maxLiveApplications: number;
  maxDevices: number;
}

export async function getEntitlements(organizationId: string, tx: Tx = prisma): Promise<Entitlements> {
  const [sub, org] = await Promise.all([
    tx.subscription.findUnique({ where: { organizationId }, include: { plan: true } }),
    tx.organization.findUnique({ where: { id: organizationId }, select: { suspendedAt: true, billingOverdueSince: true, billingEndsAt: true } }),
  ]);
  const now = Date.now();
  // Suspensão administrativa e atraso além da tolerância bloqueiam do mesmo jeito.
  const overdue = !!org?.billingOverdueSince && now - org.billingOverdueSince.getTime() > OVERDUE_GRACE_MS;
  const suspended = !!org?.suspendedAt || overdue;
  const ended = !!org?.billingEndsAt && org.billingEndsAt.getTime() <= now;
  if (!sub || sub.status === "cancelled" || ended) {
    return {
      planCode: null,
      planName: "Sandbox",
      // Fatura atrasada sem plano pago não tira o modo de teste.
      status: org?.suspendedAt ? "suspended" : sub ? "cancelled" : "sandbox",
      ...SANDBOX_ENTITLEMENTS,
    };
  }
  return {
    planCode: sub.plan.code,
    planName: sub.plan.name,
    status: suspended ? "suspended" : sub.status,
    maxLiveApplications: sub.plan.maxLiveApplications,
    maxDevices: sub.plan.maxDevices,
  };
}

export async function ensureDefaultPlans() {
  for (const p of DEFAULT_PLANS) {
    await prisma.plan.upsert({ where: { code: p.code }, update: {}, create: { ...p } });
  }
}
