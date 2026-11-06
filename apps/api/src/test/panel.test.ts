import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { prisma } from "../db.js";
import { testOutbox } from "../lib/mail.js";
import { resetDb } from "./helpers.js";

let app: FastifyInstance;
const PASSWORD = "senha-forte-123";

beforeAll(async () => {
  app = await buildApp({ logger: false });
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  testOutbox.length = 0;
});

interface Client {
  cookie: string;
  csrf: string;
  orgId: string;
  req: (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: object) => Promise<LightMyRequestResponse>;
}

const tokenFromMail = (text: string) => /#token=([\w-]+)/.exec(text)![1]!;

async function signIn(email: string, password = PASSWORD): Promise<Client> {
  const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password } });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === "simvio_session")!;
  expect(cookie.httpOnly).toBe(true);
  const header = `simvio_session=${cookie.value}`;
  const me = (await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie: header } })).json();
  const csrf = me.csrf_token as string;
  return {
    cookie: header,
    csrf,
    orgId: me.organizations[0]?.id,
    req: (method, url, payload) =>
      app.inject({ method, url, payload, headers: { cookie: header, "x-csrf-token": csrf } }),
  };
}

async function signUp(email: string, org = "Org"): Promise<Client> {
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: { name: "Pessoa", email, password: PASSWORD, organization_name: org },
  });
  expect(res.statusCode).toBe(202);
  const mail = testOutbox.findLast((m) => m.to === email)!;
  const verified = await app.inject({ method: "POST", url: "/v1/auth/verify-email", payload: { token: tokenFromMail(mail.text) } });
  expect(verified.statusCode).toBe(200);
  return signIn(email);
}

async function givePlan(orgId: string, code = "profissional") {
  const plan = await prisma.plan.upsert({
    where: { code },
    update: {},
    create: { code, name: code, priceCents: 17900, maxLiveApplications: 1, maxDevices: 2 },
  });
  await prisma.subscription.upsert({ where: { organizationId: orgId }, update: { planId: plan.id }, create: { organizationId: orgId, planId: plan.id } });
}

describe("contas", () => {
  it("cadastro não revela e-mail existente e exige confirmação para entrar", async () => {
    await app.inject({ method: "POST", url: "/v1/auth/register", payload: { name: "Ana", email: "ana@a.test", password: PASSWORD, organization_name: "Org A" } });
    const blocked = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "ana@a.test", password: PASSWORD } });
    expect(blocked.statusCode).toBe(403);
    const again = await app.inject({ method: "POST", url: "/v1/auth/register", payload: { name: "Outra", email: "ANA@a.test", password: PASSWORD, organization_name: "Org B" } });
    expect(again.statusCode).toBe(202);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.organization.count()).toBe(1);
  });

  it("senha errada e conta inexistente têm a mesma resposta", async () => {
    await signUp("ana@a.test");
    const wrong = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "ana@a.test", password: "errada-errada" } });
    const none = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "nao@existe.test", password: "errada-errada" } });
    expect(wrong.statusCode).toBe(401);
    expect(none.statusCode).toBe(401);
    expect(wrong.body).toBe(none.body);
  });

  it("recuperação de senha é de uso único e encerra as sessões", async () => {
    const c = await signUp("ana@a.test");
    await app.inject({ method: "POST", url: "/v1/auth/forgot-password", payload: { email: "ana@a.test" } });
    const none = await app.inject({ method: "POST", url: "/v1/auth/forgot-password", payload: { email: "nao@existe.test" } });
    expect(none.statusCode).toBe(200);
    const token = tokenFromMail(testOutbox.at(-1)!.text);
    const reset = (password: string) => app.inject({ method: "POST", url: "/v1/auth/reset-password", payload: { token, password } });
    expect((await reset("nova-senha-forte")).statusCode).toBe(200);
    expect((await reset("outra-senha-forte")).statusCode).toBe(400);
    expect((await c.req("GET", "/v1/auth/me")).statusCode).toBe(401);
    await signIn("ana@a.test", "nova-senha-forte");
  });

  it("logout revoga a sessão no servidor", async () => {
    const c = await signUp("ana@a.test");
    expect((await c.req("POST", "/v1/auth/logout")).statusCode).toBe(200);
    expect((await c.req("GET", "/v1/auth/me")).statusCode).toBe(401);
  });
});

describe("CSRF e origem", () => {
  it("recusa alteração sem token CSRF ou de outra origem", async () => {
    const c = await signUp("ana@a.test");
    const url = `/v1/orgs/${c.orgId}/applications`;
    const payload = { name: "App", display_name: "App" };
    const noCsrf = await app.inject({ method: "POST", url, payload, headers: { cookie: c.cookie } });
    expect(noCsrf.statusCode).toBe(403);
    const badOrigin = await app.inject({ method: "POST", url, payload, headers: { cookie: c.cookie, "x-csrf-token": c.csrf, origin: "https://malicioso.test" } });
    expect(badOrigin.statusCode).toBe(403);
    const ok = await app.inject({ method: "POST", url, payload, headers: { cookie: c.cookie, "x-csrf-token": c.csrf, origin: "https://simvio.test" } });
    expect(ok.statusCode).toBe(201);
  });
});

describe("isolamento entre organizações (RF01)", () => {
  it("usuário de A não lê nem altera dados de B, inclusive por ID direto", async () => {
    const a = await signUp("a@a.test", "Org A");
    const b = await signUp("b@b.test", "Org B");
    const appB = (await b.req("POST", `/v1/orgs/${b.orgId}/applications`, { name: "Do B", display_name: "Loja B" })).json();
    expect(appB.id).toBeTruthy();
    const keyB = (await b.req("POST", `/v1/orgs/${b.orgId}/applications/${appB.id}/keys`, { environment: "test" })).json();
    expect(keyB.id).toBeTruthy();

    // Rota da organização alheia: 404, sem revelar que existe.
    for (const path of ["overview", "applications", "devices", "verifications", "members", "subscription", "deliveries"]) {
      expect((await a.req("GET", `/v1/orgs/${b.orgId}/${path}`)).statusCode, path).toBe(404);
    }
    expect((await a.req("POST", `/v1/orgs/${b.orgId}/applications`, { name: "Invasor", display_name: "Invasor" })).statusCode).toBe(404);

    // Recurso de B acessado pela organização de A.
    expect((await a.req("PATCH", `/v1/orgs/${a.orgId}/applications/${appB.id}`, { name: "Trocado" })).statusCode).toBe(404);
    expect((await a.req("POST", `/v1/orgs/${a.orgId}/applications/${appB.id}/keys`, { environment: "test" })).statusCode).toBe(404);
    expect((await a.req("POST", `/v1/orgs/${a.orgId}/keys/${keyB.id}/revoke`)).statusCode).toBe(404);
    expect((await a.req("POST", `/v1/orgs/${a.orgId}/keys/${keyB.id}/rotate`)).statusCode).toBe(404);
    const stillValid = await prisma.apiKey.findUniqueOrThrow({ where: { id: keyB.id } });
    expect(stillValid.revokedAt).toBeNull();
  });

  it("listagens mostram só a própria organização e nunca o segredo", async () => {
    const a = await signUp("a@a.test", "Org A");
    const created = (await a.req("POST", `/v1/orgs/${a.orgId}/applications`, { name: "App", display_name: "App" })).json();
    const key = (await a.req("POST", `/v1/orgs/${a.orgId}/applications/${created.id}/keys`, { environment: "test" })).json();
    expect(key.secret).toMatch(/^sk_test_/);
    const list = await a.req("GET", `/v1/orgs/${a.orgId}/applications`);
    expect(list.body).not.toContain(key.secret);
    expect(list.json()[0].keys[0].prefix).toBe(key.secret.slice(0, 14));
  });
});

describe("papéis", () => {
  async function teamWithViewer() {
    const owner = await signUp("dono@a.test", "Org A");
    await owner.req("POST", `/v1/orgs/${owner.orgId}/invitations`, { email: "ver@a.test", role: "viewer" });
    const token = tokenFromMail(testOutbox.at(-1)!.text);
    const accepted = await app.inject({ method: "POST", url: "/v1/invitations/accept", payload: { token, name: "Vera", password: PASSWORD } });
    expect(accepted.statusCode).toBe(200);
    return { owner, viewer: await signIn("ver@a.test"), token };
  }

  it("visualizador consulta, mas não altera; convite é de uso único", async () => {
    const { owner, viewer, token } = await teamWithViewer();
    expect(viewer.orgId).toBe(owner.orgId);
    expect((await viewer.req("GET", `/v1/orgs/${owner.orgId}/applications`)).statusCode).toBe(200);
    expect((await viewer.req("POST", `/v1/orgs/${owner.orgId}/applications`, { name: "App", display_name: "App" })).statusCode).toBe(403);
    expect((await viewer.req("POST", `/v1/orgs/${owner.orgId}/pairings`)).statusCode).toBe(403);
    expect((await viewer.req("POST", `/v1/orgs/${owner.orgId}/invitations`, { email: "x@a.test", role: "owner" })).statusCode).toBe(403);
    const again = await app.inject({ method: "POST", url: "/v1/invitations/accept", payload: { token, name: "Vera", password: PASSWORD } });
    expect(again.statusCode).toBe(400);
  });

  it("desenvolvedor não altera equipe; último proprietário não pode sair", async () => {
    const { owner } = await teamWithViewer();
    const { members } = (await owner.req("GET", `/v1/orgs/${owner.orgId}/members`)).json();
    const self = members.find((m: { email: string }) => m.email === "dono@a.test");
    const vera = members.find((m: { email: string }) => m.email === "ver@a.test");
    expect((await owner.req("PATCH", `/v1/orgs/${owner.orgId}/members/${vera.id}`, { role: "developer" })).statusCode).toBe(200);
    const dev = await signIn("ver@a.test");
    expect((await dev.req("POST", `/v1/orgs/${owner.orgId}/applications`, { name: "App", display_name: "App" })).statusCode).toBe(201);
    expect((await dev.req("DELETE", `/v1/orgs/${owner.orgId}/members/${self.id}`)).statusCode).toBe(403);
    expect((await owner.req("PATCH", `/v1/orgs/${owner.orgId}/members/${self.id}`, { role: "viewer" })).statusCode).toBe(409);
    expect((await owner.req("DELETE", `/v1/orgs/${owner.orgId}/members/${self.id}`)).statusCode).toBe(409);
  });
});

describe("planos e chaves (RF02, RF12)", () => {
  it("sandbox não habilita produção; limite do plano vale no servidor", async () => {
    const c = await signUp("a@a.test");
    const mk = async (n: string) => (await c.req("POST", `/v1/orgs/${c.orgId}/applications`, { name: n, display_name: n })).json();
    const first = await mk("Um");
    const second = await mk("Dois");
    const enable = (id: string, enabled = true) => c.req("POST", `/v1/orgs/${c.orgId}/applications/${id}/live`, { enabled });
    expect((await enable(first.id)).statusCode).toBe(402);
    expect((await c.req("POST", `/v1/orgs/${c.orgId}/applications/${first.id}/keys`, { environment: "live" })).statusCode).toBe(400);
    await givePlan(c.orgId);
    expect((await enable(first.id)).statusCode).toBe(200);
    expect((await enable(second.id)).statusCode).toBe(402);
    expect((await c.req("POST", `/v1/orgs/${c.orgId}/applications/${first.id}/keys`, { environment: "live" })).json().secret).toMatch(/^sk_live_/);
  });

  it("limite de aparelhos bloqueia novo pareamento", async () => {
    const c = await signUp("a@a.test");
    const p = (await c.req("POST", `/v1/orgs/${c.orgId}/pairings`)).json();
    expect((await app.inject({ method: "POST", url: "/v1/devices/pair", payload: { code: p.code } })).statusCode).toBe(201);
    const blocked = await c.req("POST", `/v1/orgs/${c.orgId}/pairings`);
    expect(blocked.statusCode).toBe(402);
    expect((await c.req("GET", `/v1/orgs/${c.orgId}/pairings/${p.id}`)).json().used).toBe(true);
  });

  it("rotação e revogação são efetivas imediatamente", async () => {
    const c = await signUp("a@a.test");
    const created = (await c.req("POST", `/v1/orgs/${c.orgId}/applications`, { name: "App", display_name: "App" })).json();
    const key = (await c.req("POST", `/v1/orgs/${c.orgId}/applications/${created.id}/keys`, { environment: "test" })).json();
    const call = (secret: string) => app.inject({ method: "GET", url: "/v1/verifications/inexistente", headers: { authorization: `Bearer ${secret}` } });
    expect((await call(key.secret)).statusCode).toBe(404);
    const rotated = (await c.req("POST", `/v1/orgs/${c.orgId}/keys/${key.id}/rotate`)).json();
    expect((await call(key.secret)).statusCode).toBe(401);
    expect((await call(rotated.secret)).statusCode).toBe(404);
    await c.req("POST", `/v1/orgs/${c.orgId}/keys/${rotated.id}/revoke`);
    expect((await call(rotated.secret)).statusCode).toBe(401);
  });
});

describe("webhooks pelo painel", () => {
  it("recusa destino inseguro, mostra o segredo só uma vez e registra auditoria", async () => {
    const { config } = await import("../config.js");
    config.WEBHOOK_ALLOW_PRIVATE_TARGETS = false;
    const c = await signUp("a@a.test");
    const created = (await c.req("POST", `/v1/orgs/${c.orgId}/applications`, { name: "App", display_name: "App" })).json();
    const url = `/v1/orgs/${c.orgId}/applications/${created.id}/webhooks`;
    expect((await c.req("POST", url, { url: "http://example.com/h", environment: "test" })).statusCode).toBe(400);
    expect((await c.req("POST", url, { url: "https://169.254.169.254/latest", environment: "test" })).statusCode).toBe(400);
    const ok = (await c.req("POST", url, { url: "https://example.com/h", environment: "test" })).json();
    expect(ok.secret).toMatch(/^whsec_/);
    const list = await c.req("GET", `/v1/orgs/${c.orgId}/applications`);
    expect(list.body).not.toContain(ok.secret);
    config.WEBHOOK_ALLOW_PRIVATE_TARGETS = true;
    expect(await prisma.auditLog.count({ where: { action: "webhook.created" } })).toBe(1);
  });
});
