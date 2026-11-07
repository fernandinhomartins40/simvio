import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { prisma } from "../db.js";
import { testOutbox } from "../lib/mail.js";
import { ensureDefaultPlans } from "../modules/plans.js";
import { resetDb } from "./helpers.js";

let app: FastifyInstance;
const PASSWORD = "Senha-forte-123";
const HOOK = { "asaas-access-token": "segredo-do-webhook" };

/** Asaas em memória: só o que a Simvio usa. */
type Payment = { id: string; status: string; dueDate: string; invoiceUrl: string; value: number };
let asaas: { customers: Map<string, object>; subs: Map<string, { value: number; deleted: boolean; payments: Payment[] }>; calls: string[] };

function fakeFetch(input: string | URL | Request, init?: RequestInit) {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  const path = url.pathname.replace(/^\/v3/, "");
  asaas.calls.push(`${method} ${path}`);
  const json = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status }));
  let m: RegExpExecArray | null;
  if (method === "POST" && path === "/customers") {
    if (body.cpfCnpj === "00000000000") return json({ errors: [{ description: "O CPF/CNPJ informado é inválido." }] }, 400);
    const id = `cus_${asaas.customers.size + 1}`;
    asaas.customers.set(id, body);
    return json({ id });
  }
  if ((m = /^\/customers\/(\w+)$/.exec(path)) && method === "PUT") return json({ id: m[1] });
  if (method === "POST" && path === "/subscriptions") {
    const id = `sub_${asaas.subs.size + 1}`;
    asaas.subs.set(id, { value: body.value, deleted: false, payments: [{ id: `pay_${id}_1`, status: "PENDING", dueDate: body.nextDueDate, invoiceUrl: `https://asaas.test/i/${id}_1`, value: body.value }] });
    return json({ id });
  }
  if ((m = /^\/subscriptions\/(\w+)(\/payments)?$/.exec(path))) {
    const sub = asaas.subs.get(m[1]!);
    if (!sub) return json({}, 404);
    if (m[2]) return json({ data: sub.payments });
    if (method === "PUT") {
      sub.value = body.value;
      for (const p of sub.payments) if (body.updatePendingPayments && p.status === "PENDING") p.value = body.value;
      return json({ id: m[1] });
    }
    if (method === "DELETE") {
      sub.deleted = true;
      return json({ deleted: true });
    }
    return json({ status: sub.deleted ? "INACTIVE" : "ACTIVE", deleted: sub.deleted });
  }
  return json({}, 500);
}

beforeAll(async () => {
  app = await buildApp({ logger: false });
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  await ensureDefaultPlans();
  testOutbox.length = 0;
  asaas = { customers: new Map(), subs: new Map(), calls: [] };
  vi.spyOn(globalThis, "fetch").mockImplementation(fakeFetch as typeof fetch);
});
afterEach(() => vi.restoreAllMocks());

async function owner() {
  const email = "dona@loja.test";
  await app.inject({ method: "POST", url: "/v1/auth/register", payload: { name: "Dona", email, password: PASSWORD, organization_name: "Loja" } });
  const token = /#token=([\w-]+)/.exec(testOutbox.findLast((m) => m.to === email)!.text)![1];
  await app.inject({ method: "POST", url: "/v1/auth/verify-email", payload: { token } });
  const login = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password: PASSWORD } });
  const cookie = `simvio_session=${login.cookies.find((c) => c.name === "simvio_session")!.value}`;
  const me = (await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie } })).json();
  const orgId = me.organizations[0].id as string;
  const req = (method: "GET" | "POST", url: string, payload?: object) =>
    app.inject({ method, url: `/v1/orgs/${orgId}${url}`, payload, headers: { cookie, "x-csrf-token": me.csrf_token } });
  return { orgId, req };
}

const checkout = { plan_code: "essencial", cpf_cnpj: "123.456.789-09", name: "Loja Ltda", email: "financeiro@loja.test" };
const status = async (c: Awaited<ReturnType<typeof owner>>) => (await c.req("GET", "/subscription")).json();
const hook = (subscription: string) => app.inject({ method: "POST", url: "/v1/billing/asaas/webhook", headers: HOOK, payload: { event: "PAYMENT_RECEIVED", payment: { subscription } } });

describe("cobrança pelo Asaas", () => {
  it("assina, libera só depois do pagamento e troca de plano na próxima fatura", async () => {
    const c = await owner();
    const res = await c.req("POST", "/billing/checkout", checkout);
    expect(res.statusCode).toBe(200);
    expect(res.json().invoice_url).toBe("https://asaas.test/i/sub_1_1");
    const customer = asaas.customers.get("cus_1") as { cpfCnpj: string; externalReference: string };
    expect(customer.cpfCnpj).toBe("12345678909");
    expect(customer.externalReference).toBe(`simvio:org:${c.orgId}`);
    // Sem pagamento continua em teste.
    expect((await status(c)).status).toBe("sandbox");

    asaas.subs.get("sub_1")!.payments[0]!.status = "RECEIVED";
    expect((await hook("sub_1")).json().handled).toBe(true);
    let s = await status(c);
    expect(s.status).toBe("active");
    expect(s.plan_code).toBe("essencial");
    expect(s.billing.invoice_url).toBeNull();

    // Troca: limites na hora, valor novo só nas faturas ainda abertas.
    asaas.subs.get("sub_1")!.payments.push({ id: "p2", status: "PENDING", dueDate: "2099-01-01", invoiceUrl: "https://asaas.test/i/2", value: 79 });
    expect((await c.req("POST", "/billing/checkout", { plan_code: "profissional" })).statusCode).toBe(200);
    s = await status(c);
    expect(s.plan_code).toBe("profissional");
    expect(asaas.subs.size).toBe(1);
    expect(asaas.subs.get("sub_1")!.payments.map((p) => p.value)).toEqual([79, 179]);
  });

  it("bloqueia depois de 7 dias de atraso e libera quando paga", async () => {
    const c = await owner();
    await c.req("POST", "/billing/checkout", checkout);
    const pays = asaas.subs.get("sub_1")!.payments;
    pays[0]!.status = "RECEIVED";
    const late = new Date(Date.now() - 8 * 86_400_000).toLocaleDateString("en-CA");
    pays.push({ id: "p2", status: "OVERDUE", dueDate: late, invoiceUrl: "https://asaas.test/i/2", value: 79 });
    await hook("sub_1");
    const s = await status(c);
    expect(s.status).toBe("suspended");
    expect(s.billing.invoice_url).toBe("https://asaas.test/i/2");

    pays[1]!.status = "CONFIRMED";
    expect((await c.req("POST", "/billing/sync")).statusCode).toBe(200);
    expect((await status(c)).status).toBe("active");
  });

  it("atraso dentro da tolerância só avisa", async () => {
    const c = await owner();
    await c.req("POST", "/billing/checkout", checkout);
    const pays = asaas.subs.get("sub_1")!.payments;
    pays[0]!.status = "RECEIVED";
    pays.push({ id: "p2", status: "OVERDUE", dueDate: new Date(Date.now() - 2 * 86_400_000).toLocaleDateString("en-CA"), invoiceUrl: "x", value: 79 });
    await hook("sub_1");
    const s = await status(c);
    expect(s.status).toBe("active");
    expect(s.billing.overdue_since).not.toBeNull();
  });

  it("cancelamento mantém o período pago e depois volta ao teste", async () => {
    const c = await owner();
    await c.req("POST", "/billing/checkout", checkout);
    asaas.subs.get("sub_1")!.payments[0]!.status = "RECEIVED";
    await hook("sub_1");
    const res = await c.req("POST", "/billing/cancel");
    expect(res.statusCode).toBe(200);
    expect(asaas.subs.get("sub_1")!.deleted).toBe(true);
    expect((await status(c)).status).toBe("active");
    await prisma.organization.update({ where: { id: c.orgId }, data: { billingEndsAt: new Date(Date.now() - 1000) } });
    expect((await status(c)).status).toBe("cancelled");
    // Aviso de assinatura já cancelada não é mais da Simvio.
    expect((await hook("sub_1")).json().handled).toBe(false);
  });

  it("webhook exige o token e ignora cobranças de outros sistemas da conta", async () => {
    const bad = await app.inject({ method: "POST", url: "/v1/billing/asaas/webhook", headers: { "asaas-access-token": "errado" }, payload: {} });
    expect(bad.statusCode).toBe(401);
    const foreign = await hook("sub_de_outro_sistema");
    expect(foreign.statusCode).toBe(200);
    expect(foreign.json().handled).toBe(false);
    expect(asaas.calls).toEqual([]);
  });

  it("recusa CPF inválido com a mensagem do Asaas e só o proprietário assina", async () => {
    const c = await owner();
    expect((await c.req("POST", "/billing/checkout", { plan_code: "essencial" })).statusCode).toBe(400);
    const res = await c.req("POST", "/billing/checkout", { ...checkout, cpf_cnpj: "000.000.000-00" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("CPF/CNPJ");
    await prisma.membership.updateMany({ where: { organizationId: c.orgId }, data: { role: "developer" } });
    expect((await c.req("POST", "/billing/checkout", checkout)).statusCode).toBe(403);
  });
});
