import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { prisma } from "../db.js";
import { hashPassword } from "../lib/crypto.js";
import { currentStep, totpAt } from "../lib/totp.js";
import { bearer, createTenant, nextPhone, resetDb } from "./helpers.js";

let app: FastifyInstance;
const PASSWORD = "senha-forte-123";

beforeAll(async () => {
  app = await buildApp({ logger: false });
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(resetDb);

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
interface Client {
  req: (method: Method, url: string, payload?: object) => Promise<LightMyRequestResponse>;
}

async function createUser(email: string, superAdmin: boolean) {
  return prisma.user.create({
    data: { email, name: "Pessoa", passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date(), isSuperAdmin: superAdmin },
  });
}

async function signIn(email: string): Promise<Client> {
  const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password: PASSWORD } });
  expect(res.statusCode).toBe(200);
  const cookie = `simvio_session=${res.cookies.find((c) => c.name === "simvio_session")!.value}`;
  const csrf = (await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie } })).json().csrf_token as string;
  return { req: (method, url, payload) => app.inject({ method, url, payload, headers: { cookie, "x-csrf-token": csrf } }) };
}

/** Superadmin com TOTP configurado e confirmado na sessão. */
async function adminWithMfa() {
  await createUser("admin@simvio.test", true);
  const admin = await signIn("admin@simvio.test");
  const setup = (await admin.req("POST", "/v1/admin/mfa/setup")).json();
  const confirm = await admin.req("POST", "/v1/admin/mfa/confirm", { code: totpAt(setup.secret, currentStep()) });
  expect(confirm.statusCode).toBe(200);
  return { admin, secret: setup.secret as string, recovery: confirm.json().recovery_codes as string[] };
}

describe("administração", () => {
  it("TOTP segue o vetor da RFC 6238 (SHA-1, T=59s)", () => {
    // Segredo ASCII "12345678901234567890" em Base32; RFC: 94287082 → últimos 6 dígitos.
    expect(totpAt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", currentStep(59_000))).toBe("287082");
  });

  it("usuário comum não enxerga a área administrativa", async () => {
    await createUser("comum@simvio.test", false);
    const user = await signIn("comum@simvio.test");
    expect((await user.req("GET", "/v1/admin/organizations")).statusCode).toBe(404);
    expect((await user.req("GET", "/v1/admin/mfa")).statusCode).toBe(404);
    expect((await user.req("POST", "/v1/admin/mfa/setup")).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/v1/admin/organizations" })).statusCode).toBe(401);
  });

  it("superadmin sem TOTP recebe mfa_required; código correto libera e não pode ser reutilizado", async () => {
    await createUser("admin@simvio.test", true);
    const admin = await signIn("admin@simvio.test");

    const blocked = await admin.req("GET", "/v1/admin/organizations");
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.details).toMatchObject({ reason: "mfa_required", enrolled: false });

    const setup = (await admin.req("POST", "/v1/admin/mfa/setup")).json();
    expect(setup.otpauth_uri).toMatch(/^otpauth:\/\/totp\/Simvio%3Aadmin%40simvio\.test\?secret=/);
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: "admin@simvio.test" } });
    expect(stored.totpSecretEnc).not.toContain(setup.secret);

    expect((await admin.req("POST", "/v1/admin/mfa/confirm", { code: "000000" })).statusCode).toBe(400);
    const code = totpAt(setup.secret, currentStep());
    const confirm = await admin.req("POST", "/v1/admin/mfa/confirm", { code });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json().recovery_codes).toHaveLength(10);
    expect((await admin.req("GET", "/v1/admin/organizations")).statusCode).toBe(200);

    // Nova sessão exige o código de novo; o mesmo código (mesmo passo) é recusado.
    const second = await signIn("admin@simvio.test");
    expect((await second.req("GET", "/v1/admin/organizations")).json().error.details).toMatchObject({ reason: "mfa_required", enrolled: true });
    expect((await second.req("POST", "/v1/admin/mfa/verify", { code })).statusCode).toBe(400);
    const next = totpAt(setup.secret, currentStep() + 1);
    expect((await second.req("POST", "/v1/admin/mfa/verify", { code: next })).statusCode).toBe(200);
    expect((await second.req("GET", "/v1/admin/organizations")).statusCode).toBe(200);
  });

  it("código de recuperação funciona uma única vez", async () => {
    const { recovery } = await adminWithMfa();
    const other = await signIn("admin@simvio.test");
    expect((await other.req("POST", "/v1/admin/mfa/verify", { recovery_code: recovery[0] })).statusCode).toBe(200);
    const third = await signIn("admin@simvio.test");
    expect((await third.req("POST", "/v1/admin/mfa/verify", { recovery_code: recovery[0] })).statusCode).toBe(400);
    expect((await third.req("GET", "/v1/admin/mfa")).json()).toMatchObject({ enrolled: true, verified: false, recovery_codes_left: 9 });
  });

  it("lista organizações e muda o plano manualmente com auditoria", async () => {
    const { admin } = await adminWithMfa();
    const t = await createTenant("Loja Azul");
    await prisma.plan.upsert({
      where: { code: "essencial" },
      update: {},
      create: { code: "essencial", name: "Essencial", priceCents: 7900, maxLiveApplications: 1, maxDevices: 1 },
    });

    const list = (await admin.req("GET", "/v1/admin/organizations?q=azul")).json();
    expect(list.data).toHaveLength(1);
    expect(list.data[0]).toMatchObject({ id: t.orgId, plan: { code: "agencia" }, usage: { active_devices: 1, live_applications: 1 } });

    const change = await admin.req("PUT", `/v1/admin/organizations/${t.orgId}/subscription`, {
      plan_code: "essencial",
      status: "active",
      current_period_end: "2026-12-31",
      notes: "Pix recebido",
    });
    expect(change.statusCode).toBe(200);
    const detail = (await admin.req("GET", `/v1/admin/organizations/${t.orgId}`)).json();
    expect(detail.subscription).toMatchObject({ plan_code: "essencial", status: "active", notes: "Pix recebido" });
    expect(detail.entitlements.max_devices).toBe(1);
    expect(detail.devices[0].line.phone_masked).not.toBe(t.receiver);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "admin.subscription_changed", organizationId: t.orgId } });
    expect(log.actorType).toBe("superadmin");
    expect(log.metadata).toMatchObject({ before: { plan: "agencia" }, after: { plan: "essencial" } });

    const audit = (await admin.req("GET", `/v1/admin/audit-logs?organization_id=${t.orgId}`)).json();
    expect(audit.data.some((a: { action: string }) => a.action === "admin.subscription_changed")).toBe(true);

    expect((await admin.req("PUT", `/v1/admin/organizations/${t.orgId}/subscription`, { plan_code: "inexistente" })).statusCode).toBe(400);
  });

  it("suspensão bloqueia novas verificações e reativação libera", async () => {
    const { admin } = await adminWithMfa();
    const t = await createTenant("Org");
    const create = (key: string) =>
      app.inject({
        method: "POST",
        url: "/v1/verifications",
        headers: { ...bearer(key), "idempotency-key": `k-${Math.random().toString(36).slice(2)}` },
        payload: { phone_number: nextPhone(), reference: `ref-${Math.random().toString(36).slice(2)}`, purpose: "signup" },
      });

    expect((await admin.req("POST", `/v1/admin/organizations/${t.orgId}/suspend`, { reason: "x" })).statusCode).toBe(400);
    expect((await admin.req("POST", `/v1/admin/organizations/${t.orgId}/suspend`, { reason: "Suspeita de abuso" })).statusCode).toBe(200);
    const blocked = await create(t.testKey);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe("suspended");

    expect((await admin.req("POST", `/v1/admin/organizations/${t.orgId}/reactivate`, { reason: "Conferido com o cliente" })).statusCode).toBe(200);
    expect((await create(t.testKey)).statusCode).toBe(201);

    const actions = (await prisma.auditLog.findMany({ where: { organizationId: t.orgId, actorType: "superadmin" } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["admin.organization_suspended", "admin.organization_reactivated"]));
  });

  it("revoga aparelho de qualquer organização", async () => {
    const { admin } = await adminWithMfa();
    const t = await createTenant("Org");
    const res = await admin.req("POST", `/v1/admin/organizations/${t.orgId}/devices/${t.device.id}/revoke`, { reason: "Aparelho perdido" });
    expect(res.statusCode).toBe(200);
    expect((await prisma.device.findUniqueOrThrow({ where: { id: t.device.id } })).status).toBe("revoked");
    // Aparelho de outra organização não é aceito pelo id cruzado.
    const other = await createTenant("Outra");
    expect((await admin.req("POST", `/v1/admin/organizations/${t.orgId}/devices/${other.device.id}/revoke`, { reason: "Tentativa cruzada" })).statusCode).toBe(404);
  });
});

describe("entregas por ambiente", () => {
  it("filtra entregas de avisos automáticos por teste/produção", async () => {
    const t = await createTenant("Org");
    const user = await createUser("dono@simvio.test", false);
    await prisma.membership.create({ data: { organizationId: t.orgId, userId: user.id, role: "owner" } });
    const owner = await signIn("dono@simvio.test");

    for (const environment of ["test", "live"] as const) {
      const endpoint = await prisma.webhookEndpoint.create({
        data: { organizationId: t.orgId, applicationId: t.appId, environment, url: "https://example.com/hook", secretEnc: "x" },
      });
      const event = await prisma.outboxEvent.create({
        data: { organizationId: t.orgId, applicationId: t.appId, environment, type: "verification.verified", payload: {} },
      });
      await prisma.webhookDelivery.create({ data: { organizationId: t.orgId, outboxEventId: event.id, endpointId: endpoint.id } });
    }

    const all = (await owner.req("GET", `/v1/orgs/${t.orgId}/deliveries`)).json();
    expect(all).toHaveLength(2);
    const live = (await owner.req("GET", `/v1/orgs/${t.orgId}/deliveries?environment=live`)).json();
    expect(live).toHaveLength(1);
    expect(live[0].environment).toBe("live");
    expect((await owner.req("GET", `/v1/orgs/${t.orgId}/deliveries?environment=outro`)).statusCode).toBe(400);
  });

  it("login da administração recusa cliente com a mesma mensagem e sem sessão", async () => {
    await createUser("comum@simvio.test", false);
    await createUser("admin@simvio.test", true);
    const cliente = await app.inject({ method: "POST", url: "/v1/admin/login", payload: { email: "comum@simvio.test", password: PASSWORD } });
    const errada = await app.inject({ method: "POST", url: "/v1/admin/login", payload: { email: "admin@simvio.test", password: "senha-errada-123" } });
    expect(cliente.statusCode).toBe(401);
    expect(cliente.json().error.message ?? cliente.json()).toEqual(errada.json().error.message ?? errada.json());
    expect(cliente.cookies.some((c) => c.name === "simvio_session")).toBe(false);
    const ok = await app.inject({ method: "POST", url: "/v1/admin/login", payload: { email: "admin@simvio.test", password: PASSWORD } });
    expect(ok.statusCode).toBe(200);
    expect(ok.cookies.some((c) => c.name === "simvio_session")).toBe(true);
  });

  it("novas rotas exigem superadmin com autenticador", async () => {
    await createUser("comum@simvio.test", false);
    const user = await signIn("comum@simvio.test");
    await createUser("sem-mfa@simvio.test", true);
    const noMfa = await signIn("sem-mfa@simvio.test");
    for (const [method, url] of [["GET", "/v1/admin/overview"], ["GET", "/v1/admin/users"], ["POST", "/v1/admin/plans"], ["POST", "/v1/admin/users/x/send-reset"], ["POST", "/v1/admin/organizations/x/delete"]] as const) {
      expect((await user.req(method, url, {})).statusCode).toBe(404);
      expect((await noMfa.req(method, url, {})).statusCode).toBe(403);
    }
  });

  it("visão geral soma receita só de assinaturas ativas e não suspensas", async () => {
    const { admin } = await adminWithMfa();
    const a = await createTenant("Paga");
    const b = await createTenant("Suspensa");
    const plan = await prisma.plan.upsert({ where: { code: "essencial" }, update: { priceCents: 7900 }, create: { code: "essencial", name: "Essencial", priceCents: 7900, maxLiveApplications: 1, maxDevices: 1 } });
    await prisma.subscription.deleteMany({ where: { organizationId: { in: [a.orgId, b.orgId] } } });
    await prisma.subscription.createMany({ data: [{ organizationId: a.orgId, planId: plan.id }, { organizationId: b.orgId, planId: plan.id }] });
    await prisma.organization.update({ where: { id: b.orgId }, data: { suspendedAt: new Date() } });
    const res = (await admin.req("GET", "/v1/admin/overview")).json();
    expect(res.monthly_revenue_cents).toBe(7900);
    expect(res.organizations).toMatchObject({ suspended: 1, paying: 1 });
    const paying = (await admin.req("GET", "/v1/admin/organizations?status=paying")).json();
    expect(paying.data.map((o: { name: string }) => o.name)).toEqual(["Paga"]);
  });

  it("excluir cliente exige o nome, remove contas órfãs e preserva quem tem outra organização", async () => {
    const { admin } = await adminWithMfa();
    const t = await createTenant("Loja Azul");
    const other = await createTenant("Loja Verde");
    const orphan = await createUser("orfao@simvio.test", false);
    const shared = await createUser("dois@simvio.test", false);
    await prisma.membership.createMany({ data: [
      { userId: orphan.id, organizationId: t.orgId, role: "viewer" },
      { userId: shared.id, organizationId: t.orgId, role: "viewer" },
      { userId: shared.id, organizationId: other.orgId, role: "viewer" },
    ] });
    const url = `/v1/admin/organizations/${t.orgId}/delete`;
    expect((await admin.req("POST", url, { confirm_name: "outro", reason: "pedido do cliente" })).statusCode).toBe(400);
    expect(await prisma.organization.count({ where: { id: t.orgId } })).toBe(1);
    expect((await admin.req("POST", url, { confirm_name: "Loja Azul", reason: "pedido do cliente" })).statusCode).toBe(200);
    expect(await prisma.organization.count({ where: { id: t.orgId } })).toBe(0);
    expect(await prisma.user.count({ where: { id: orphan.id } })).toBe(0);
    expect(await prisma.user.count({ where: { id: shared.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "admin.organization_deleted", targetId: t.orgId } })).toBe(1);
  });

  it("administra usuários e planos com auditoria", async () => {
    const { admin } = await adminWithMfa();
    const u = await prisma.user.create({ data: { email: "novo@simvio.test", name: "Novo", passwordHash: await hashPassword(PASSWORD) } });
    expect((await admin.req("GET", "/v1/admin/users?q=novo@")).json().data[0]).toMatchObject({ email: "novo@simvio.test", email_verified: false });
    expect((await admin.req("POST", `/v1/admin/users/${u.id}/confirm-email`, {})).statusCode).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).emailVerifiedAt).not.toBeNull();
    expect((await admin.req("POST", `/v1/admin/users/${u.id}/apagar-tudo`, {})).statusCode).toBe(400);
    const session = await signIn("novo@simvio.test");
    expect((await admin.req("POST", `/v1/admin/users/${u.id}/end-sessions`, {})).statusCode).toBe(200);
    expect((await session.req("GET", "/v1/auth/me")).statusCode).toBe(401);

    await prisma.plan.deleteMany({ where: { code: "plano-x" } });
    const plan = { name: "Teste", price_cents: 1000, max_live_applications: 1, max_devices: 1, active: true };
    expect((await admin.req("POST", "/v1/admin/plans", { code: "plano-x", ...plan })).statusCode).toBe(200);
    expect((await admin.req("POST", "/v1/admin/plans", { code: "plano-x", ...plan })).statusCode).toBe(409);
    expect((await admin.req("PUT", "/v1/admin/plans/plano-x", { ...plan, price_cents: 2000 })).statusCode).toBe(200);
    expect((await prisma.plan.findUniqueOrThrow({ where: { code: "plano-x" } })).priceCents).toBe(2000);
    expect(await prisma.auditLog.count({ where: { action: { in: ["admin.plan_created", "admin.plan_changed", "admin.user_confirm_email"] } } })).toBe(3);
  });
});
