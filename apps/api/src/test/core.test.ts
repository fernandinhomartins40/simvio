import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { prisma } from "../db.js";
import { bearer, createTenant, nextPhone, resetDb, tokenFromMessage, type Tenant } from "./helpers.js";

let app: FastifyInstance;
let A: Tenant;
let B: Tenant;

beforeAll(async () => {
  app = await buildApp({ logger: false });
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  A = await createTenant("A");
  B = await createTenant("B");
});

let idem = 0;
async function create(t: Tenant, phone = nextPhone(), extra: Record<string, unknown> = {}, key = `k-${++idem}`) {
  const res = await app.inject({
    method: "POST",
    url: "/v1/verifications",
    headers: { ...bearer(t.testKey), "idempotency-key": key },
    payload: { phone_number: phone, reference: `ref-${idem}`, purpose: "signup", ...extra },
  });
  return { res, body: res.json(), phone };
}

async function sendEvent(auth: string, sender: string, token: string, eventId = `evt-${Math.random()}`, receivedAt?: string) {
  const res = await app.inject({
    method: "POST",
    url: "/v1/device-events",
    headers: { authorization: auth },
    payload: { event_id: eventId, sender, token, received_at: receivedAt },
  });
  return { res, body: res.json() };
}

async function status(t: Tenant, id: string, key = t.testKey) {
  return app.inject({ method: "GET", url: `/v1/verifications/${id}`, headers: bearer(key) });
}

describe("criação de sessão", () => {
  it("retorna id, prazo, destinatário, mensagem e URL pública", async () => {
    const { res, body } = await create(A);
    expect(res.statusCode).toBe(201);
    expect(body.status).toBe("pending");
    expect(body.receiver_number).toBe(A.receiver);
    expect(body.message_body).toMatch(/^SIMVIO [A-Z2-7]{26}$/);
    expect(body.verification_url).toMatch(/^https:\/\/simvio\.test\/v\/[A-Za-z0-9_-]+$/);
    expect(new Date(body.expires_at).getTime() - Date.now()).toBeGreaterThan(290_000);
    // O desafio não é armazenado em texto puro.
    const row = await prisma.verification.findUniqueOrThrow({ where: { id: body.id } });
    expect(JSON.stringify(row)).not.toContain(tokenFromMessage(body.message_body));
    expect(JSON.stringify(row)).not.toContain(body.phone_number.slice(3));
  });

  it("exige Idempotency-Key e repete a mesma sessão para o mesmo conteúdo", async () => {
    const noKey = await app.inject({
      method: "POST",
      url: "/v1/verifications",
      headers: bearer(A.testKey),
      payload: { phone_number: nextPhone(), reference: "x" },
    });
    expect(noKey.statusCode).toBe(400);

    const phone = nextPhone();
    const payload = { phone_number: phone, reference: "pedido-1", purpose: "signup" };
    const send = (p: object) =>
      app.inject({ method: "POST", url: "/v1/verifications", headers: { ...bearer(A.testKey), "idempotency-key": "same" }, payload: p });
    const [r1, r2] = await Promise.all([send(payload), send(payload)]);
    expect([r1.statusCode, r2.statusCode].sort()).toEqual([200, 201]);
    expect(r1.json().id).toBe(r2.json().id);
    expect(r1.json().message_body).toBe(r2.json().message_body);
    expect(await prisma.verification.count()).toBe(1);

    const conflict = await send({ ...payload, reference: "outro" });
    expect(conflict.statusCode).toBe(409);
  });

  it("nova sessão para a mesma referência invalida a anterior", async () => {
    const first = await create(A, nextPhone(), { reference: "cadastro-42" });
    const second = await create(A, first.phone, { reference: "cadastro-42" });
    expect((await status(A, first.body.id)).json().status).toBe("cancelled");
    expect((await status(A, second.body.id)).json().status).toBe("pending");
    // O desafio anterior não aprova mais.
    const ev = await sendEvent(A.device.auth, first.phone, tokenFromMessage(first.body.message_body));
    expect(ev.body.outcome).toBe("rejected_unknown");
  });

  it("rejeita telefone ambíguo e bloqueia sem receptor disponível", async () => {
    const bad = await create(A, "1187654321");
    expect(bad.res.statusCode).toBe(400);
    await prisma.device.updateMany({ where: { organizationId: A.orgId }, data: { lastSeenAt: new Date(Date.now() - 2 * 3600_000) } });
    const offline = await create(A);
    expect(offline.res.statusCode).toBe(503);
    expect(offline.body.error.code).toBe("receiver_unavailable");
  });

  it("assinatura suspensa bloqueia novas sessões, mas pendentes terminam no prazo", async () => {
    const pending = await create(A);
    await prisma.subscription.update({ where: { organizationId: A.orgId }, data: { status: "suspended" } });
    const blocked = await create(A);
    expect(blocked.res.statusCode).toBe(403);
    expect(blocked.body.error.code).toBe("suspended");
    const ev = await sendEvent(A.device.auth, pending.phone, tokenFromMessage(pending.body.message_body));
    expect(ev.body.outcome).toBe("verified");
  });
});

describe("matriz de validação (PRD §16)", () => {
  it("SMS correto no prazo: uma aprovação e um evento de saída", async () => {
    const { body, phone } = await create(A);
    const ev = await sendEvent(A.device.auth, phone, tokenFromMessage(body.message_body));
    expect(ev.res.statusCode).toBe(200);
    expect(ev.body.outcome).toBe("verified");
    const after = (await status(A, body.id)).json();
    expect(after.status).toBe("verified");
    expect(after.message_body).toBeNull();
    expect(after.verification_url).toBeNull();
    const outbox = await prisma.outboxEvent.findMany({ where: { verificationId: body.id } });
    expect(outbox.map((o) => o.type)).toEqual(["verification.verified"]);
  });

  it("remetente em formato nacional do Android também confere", async () => {
    const { body, phone } = await create(A);
    const national = `0${phone.slice(3)}`; // 011987...
    const ev = await sendEvent(A.device.auth, national, tokenFromMessage(body.message_body));
    expect(ev.body.outcome).toBe("verified");
  });

  it("remetente divergente não aprova; sessão legítima continua até o prazo", async () => {
    const { body, phone } = await create(A);
    const token = tokenFromMessage(body.message_body);
    expect((await sendEvent(A.device.auth, nextPhone(), token)).body.outcome).toBe("rejected_sender");
    expect((await sendEvent(A.device.auth, "BANCO", token)).body.outcome).toBe("rejected_sender");
    expect((await status(A, body.id)).json().status).toBe("pending");
    const publicToken = body.verification_url.split("/v/")[1];
    const pub = await app.inject({ method: "GET", url: `/v1/public/sessions/${publicToken}` });
    expect(pub.json().hint).toBe("wrong_sender");
    expect((await sendEvent(A.device.auth, phone, token)).body.outcome).toBe("verified");
  });

  it("receptor de outra organização não aprova nem revela a sessão", async () => {
    const { body, phone } = await create(A);
    const ev = await sendEvent(B.device.auth, phone, tokenFromMessage(body.message_body));
    expect(ev.body.outcome).toBe("rejected_unknown");
    expect((await status(A, body.id)).json().status).toBe("pending");
    const unknown = await sendEvent(B.device.auth, phone, "A".repeat(26));
    expect(unknown.body.outcome).toBe("rejected_unknown");
  });

  it("outro aparelho da mesma organização (receptor errado) não aprova", async () => {
    const { addDevice } = await import("./helpers.js");
    const { body, phone } = await create(A);
    const other = await addDevice(A.orgId);
    const fixed = await prisma.verification.findUniqueOrThrow({ where: { id: body.id } });
    const wrong = fixed.deviceId === A.device.id ? other : A.device;
    const ev = await sendEvent(wrong.auth, phone, tokenFromMessage(body.message_body));
    expect(ev.body.outcome).toBe("rejected_unknown");
    expect((await status(A, body.id)).json().status).toBe("pending");
  });

  it("aplicação/ambiente errado: chave de outra org ou de produção não acessa a sessão", async () => {
    const { body } = await create(A);
    expect((await status(B, body.id)).statusCode).toBe(404);
    expect((await status(A, body.id, A.liveKey)).statusCode).toBe(404);
    const cancel = await app.inject({ method: "POST", url: `/v1/verifications/${body.id}/cancel`, headers: bearer(B.testKey) });
    expect(cancel.statusCode).toBe(404);
  });

  it("token expirado não aprova, mesmo com relógio do Android adulterado", async () => {
    const { body, phone } = await create(A);
    await prisma.verification.update({ where: { id: body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const earlier = new Date(Date.now() - 10 * 60_000).toISOString();
    const ev = await sendEvent(A.device.auth, phone, tokenFromMessage(body.message_body), "late-event-1", earlier);
    expect(ev.body.outcome).toBe("rejected_expired");
    const after = (await status(A, body.id)).json();
    expect(after.status).toBe("expired");
    expect(await prisma.outboxEvent.count({ where: { verificationId: body.id, type: "verification.expired" } })).toBe(1);
  });

  it("consulta expira sob demanda, sem depender do worker", async () => {
    const { body } = await create(A);
    await prisma.verification.update({ where: { id: body.id }, data: { expiresAt: new Date(Date.now() - 1) } });
    expect((await status(A, body.id)).json().status).toBe("expired");
  });

  it("cancelada ou já consumida não muda o estado terminal", async () => {
    const c = await create(A);
    const cancel = await app.inject({ method: "POST", url: `/v1/verifications/${c.body.id}/cancel`, headers: bearer(A.testKey) });
    expect(cancel.json().status).toBe("cancelled");
    expect((await sendEvent(A.device.auth, c.phone, tokenFromMessage(c.body.message_body))).body.outcome).toBe("rejected_unknown");
    expect((await status(A, c.body.id)).json().status).toBe("cancelled");

    const v = await create(A);
    const token = tokenFromMessage(v.body.message_body);
    expect((await sendEvent(A.device.auth, v.phone, token)).body.outcome).toBe("verified");
    expect((await sendEvent(A.device.auth, v.phone, token)).body.outcome).toBe("rejected_unknown");
    const cancelVerified = await app.inject({ method: "POST", url: `/v1/verifications/${v.body.id}/cancel`, headers: bearer(A.testKey) });
    expect(cancelVerified.statusCode).toBe(409);
    expect((await status(A, v.body.id)).json().status).toBe("verified");
  });

  it("dois eventos concorrentes: um único efeito de aprovação", async () => {
    const { body, phone } = await create(A);
    const token = tokenFromMessage(body.message_body);
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => sendEvent(A.device.auth, phone, token, `concurrent-${i}`)),
    );
    const outcomes = results.map((r) => r.body.outcome);
    expect(outcomes.filter((o) => o === "verified")).toHaveLength(1);
    expect(await prisma.outboxEvent.count({ where: { verificationId: body.id } })).toBe(1);
  });

  it("mesmo evento reenviado: resposta idempotente", async () => {
    const { body, phone } = await create(A);
    const token = tokenFromMessage(body.message_body);
    const [r1, r2] = await Promise.all([
      sendEvent(A.device.auth, phone, token, "same-event"),
      sendEvent(A.device.auth, phone, token, "same-event"),
    ]);
    const r3 = await sendEvent(A.device.auth, phone, token, "same-event");
    expect([r1.body.outcome, r2.body.outcome, r3.body.outcome]).toEqual(["verified", "verified", "verified"]);
    expect(r3.body.duplicate).toBe(true);
    expect(await prisma.deviceEvent.count({ where: { eventId: "same-event" } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { verificationId: body.id } })).toBe(1);
  });

  it("dispositivo revogado: evento recusado e pendências invalidadas", async () => {
    const { revokeDevice } = await import("../modules/devices/service.js");
    const { body, phone } = await create(A);
    await revokeDevice(A.orgId, A.device.id, { type: "user", id: "u1" });
    const ev = await sendEvent(A.device.auth, phone, tokenFromMessage(body.message_body));
    expect(ev.res.statusCode).toBe(401);
    expect(ev.body.error.details.revoked).toBe(true);
    const after = (await status(A, body.id)).json();
    expect(after.status).toBe("failed");
    expect(after.failure_reason).toBe("receiver_revoked");
    expect((await create(A)).res.statusCode).toBe(503);
  });

  it("credencial pública não consulta outras sessões nem a API do integrador", async () => {
    const { body } = await create(A);
    const publicToken = body.verification_url.split("/v/")[1];
    const ok = await app.inject({ method: "GET", url: `/v1/public/sessions/${publicToken}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ status: "pending", hint: null, application_name: "A Loja", receiver_number: A.receiver });
    expect(ok.json().phone_hint).toMatch(/^\+55 11 9\*\*\*\*-\d{4}$/);
    expect(ok.headers["referrer-policy"]).toBe("no-referrer");
    const other = await app.inject({ method: "GET", url: `/v1/public/sessions/${publicToken.slice(0, -2)}xx` });
    expect(other.statusCode).toBe(404);
    const asKey = await app.inject({ method: "GET", url: `/v1/verifications/${body.id}`, headers: bearer(publicToken) });
    expect(asKey.statusCode).toBe(401);
  });

  it("mensagem com token malformado é recusada sem efeito", async () => {
    const { body, phone } = await create(A);
    const ev = await sendEvent(A.device.auth, phone, "SIMVIO-EDITADO");
    expect(ev.body.outcome).toBe("rejected_invalid");
    expect((await status(A, body.id)).json().status).toBe("pending");
  });
});

describe("pareamento e linha receptora", () => {
  it("QR/código expira, é de uso único e a linha só ativa após SMS de teste recebido", async () => {
    const { createPairing } = await import("../modules/devices/service.js");
    const user = await prisma.user.create({ data: { email: "dono@a.test", name: "Dono", passwordHash: "x" } });
    const pairing = await createPairing(A.orgId, user.id);
    expect(pairing.qr_payload).toContain("simvio://pair?api=");
    expect(pairing.qr_payload).not.toContain("sk_");

    const pair = (code: string) =>
      app.inject({ method: "POST", url: "/v1/devices/pair", payload: { code, model: "Pixel", app_version: "0.1.0" } });
    const ok = await pair(pairing.code.toLowerCase().replace(/-/g, " "));
    expect(ok.statusCode).toBe(201);
    const cred = ok.json().device_credential as string;
    expect((await pair(pairing.code)).statusCode).toBe(400); // uso único

    const auth = `Bearer ${cred}`;
    const receiver = nextPhone();
    const line = await app.inject({ method: "POST", url: "/v1/devices/line", headers: { authorization: auth }, payload: { phone_number: receiver } });
    expect(line.statusCode).toBe(200);
    const lineBody = line.json();
    expect(lineBody.sms_uri).toContain(`sms:${receiver}`);
    const me = await app.inject({ method: "GET", url: "/v1/devices/me", headers: { authorization: auth } });
    expect(me.json().line.status).toBe("pending_check");

    const ev = await sendEvent(auth, nextPhone(), tokenFromMessage(lineBody.message_body));
    expect(ev.body.outcome).toBe("line_verified");
    const me2 = await app.inject({ method: "GET", url: "/v1/devices/me", headers: { authorization: auth } });
    expect(me2.json().line.status).toBe("active");
  });

  it("código expirado é recusado", async () => {
    const { createPairing } = await import("../modules/devices/service.js");
    const user = await prisma.user.create({ data: { email: "dono2@a.test", name: "Dono", passwordHash: "x" } });
    const pairing = await createPairing(A.orgId, user.id);
    await prisma.pairingSession.update({ where: { id: pairing.id }, data: { expiresAt: new Date(Date.now() - 1) } });
    const res = await app.inject({ method: "POST", url: "/v1/devices/pair", payload: { code: pairing.code } });
    expect(res.statusCode).toBe(400);
  });

  it("troca de chip/número exige revalidação e falha as pendentes da linha", async () => {
    const { body, phone } = await create(A);
    const res = await app.inject({ method: "POST", url: "/v1/devices/line", headers: { authorization: A.device.auth }, payload: { phone_number: nextPhone() } });
    expect(res.statusCode).toBe(200);
    expect((await status(A, body.id)).json().failure_reason).toBe("receiver_line_changed");
    expect((await sendEvent(A.device.auth, phone, tokenFromMessage(body.message_body))).body.outcome).toBe("rejected_unknown");
    expect((await create(A)).res.statusCode).toBe(503); // linha não validada não recebe sessões
  });

  it("dual SIM: evento de SIM diferente do validado falha de forma segura", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/devices/line", headers: { authorization: A.device.auth }, payload: { phone_number: nextPhone() } });
    const check = await app.inject({
      method: "POST",
      url: "/v1/device-events",
      headers: { authorization: A.device.auth },
      payload: { event_id: "line-check-sim", sender: nextPhone(), token: tokenFromMessage(res.json().message_body), subscription_id: 1 },
    });
    expect(check.json().outcome).toBe("line_verified");
    const { body, phone } = await create(A);
    const token = tokenFromMessage(body.message_body);
    const send = (sub: number | undefined, id: string) =>
      app.inject({ method: "POST", url: "/v1/device-events", headers: { authorization: A.device.auth }, payload: { event_id: id, sender: phone, token, subscription_id: sub } });
    expect((await send(2, "sim-other-1")).json().outcome).toBe("rejected_receiver_sim");
    expect((await send(undefined, "sim-unknown-1")).json().outcome).toBe("rejected_receiver_sim");
    expect((await send(1, "sim-right-1")).json().outcome).toBe("verified");
  });

  it("linha validada sem índice de SIM não aceita SMS que informa um chip", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/devices/line", headers: { authorization: A.device.auth }, payload: { phone_number: nextPhone() } });
    const check = await sendEvent(A.device.auth, nextPhone(), tokenFromMessage(res.json().message_body));
    expect(check.body.outcome).toBe("line_verified");
    const { body, phone } = await create(A);
    const send = (sub: number | undefined, id: string) =>
      app.inject({ method: "POST", url: "/v1/device-events", headers: { authorization: A.device.auth }, payload: { event_id: id, sender: phone, token: tokenFromMessage(body.message_body), subscription_id: sub } });
    expect((await send(1, "sim-none-other")).json().outcome).toBe("rejected_receiver_sim");
    expect((await send(undefined, "sim-none-right")).json().outcome).toBe("verified");
  });

  it("número já ativo em outra linha não pode ser ativado de novo", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/devices/line", headers: { authorization: B.device.auth }, payload: { phone_number: A.receiver } });
    const ev = await sendEvent(B.device.auth, nextPhone(), tokenFromMessage(res.json().message_body));
    expect(ev.body.outcome).toBe("rejected_line_conflict");
  });
});
