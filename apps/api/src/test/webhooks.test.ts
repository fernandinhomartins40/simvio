import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { encrypt } from "../lib/crypto.js";
import { isBlockedAddress, validateWebhookUrl } from "../lib/ssrf.js";
import { tick } from "../modules/worker/loop.js";
import { deliverDue, fanOutOutbox, MAX_ATTEMPTS, redeliver, signPayload } from "../modules/webhooks/delivery.js";
import { bearer, createTenant, nextPhone, resetDb, tokenFromMessage, type Tenant } from "./helpers.js";

let app: FastifyInstance;
let A: Tenant;
let server: Server;
let received: { headers: IncomingMessage["headers"]; body: string }[] = [];
let respondWith = 200;
const SECRET = "whsec_teste_local";

beforeAll(async () => {
  app = await buildApp({ logger: false });
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ headers: req.headers, body });
      if (respondWith === 302) res.writeHead(302, { location: "http://169.254.169.254/" });
      else res.writeHead(respondWith);
      res.end("ok");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
});
afterAll(async () => {
  await app.close();
  server.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  received = [];
  respondWith = 200;
  config.WEBHOOK_ALLOW_PRIVATE_TARGETS = true;
  A = await createTenant("A");
  const port = (server.address() as AddressInfo).port;
  await prisma.webhookEndpoint.create({
    data: { organizationId: A.orgId, applicationId: A.appId, environment: "test", url: `http://127.0.0.1:${port}/hook`, secretEnc: encrypt(SECRET) },
  });
});
afterEach(() => {
  config.WEBHOOK_ALLOW_PRIVATE_TARGETS = true;
});

let n = 0;
async function verifyOne() {
  const phone = nextPhone();
  const res = await app.inject({
    method: "POST",
    url: "/v1/verifications",
    headers: { ...bearer(A.testKey), "idempotency-key": `w-${++n}` },
    payload: { phone_number: phone, reference: `pedido-${n}` },
  });
  const body = res.json();
  await app.inject({
    method: "POST",
    url: "/v1/device-events",
    headers: { authorization: A.device.auth },
    payload: { event_id: `ev-${n}-xxxxxx`, sender: phone, token: tokenFromMessage(body.message_body) },
  });
  return body.id as string;
}

describe("webhooks assinados e outbox", () => {
  it("entrega evento assinado (HMAC sobre timestamp.event_id.corpo) com telefone mascarado", async () => {
    const id = await verifyOne();
    await tick();
    expect(received).toHaveLength(1);
    const { headers, body } = received[0]!;
    const payload = JSON.parse(body);
    expect(payload).toMatchObject({ type: "verification.verified", verification_id: id, status: "verified", environment: "test" });
    expect(payload.phone_masked).toMatch(/\*\*\*\*/);
    expect(body).not.toMatch(/\+55119\d{8}/);
    const expected = signPayload(SECRET, Number(headers["simvio-timestamp"]), String(headers["simvio-event-id"]), body);
    expect(headers["simvio-signature"]).toBe(`v1=${expected}`);
    expect(headers["simvio-event-id"]).toBe(payload.event_id);
  });

  it("worker reinicia após o commit: o outbox continua pendente e é entregue depois", async () => {
    await verifyOne();
    // Nenhum worker rodou ("caiu" antes): evento persiste no banco.
    expect(await prisma.outboxEvent.count({ where: { status: "pending" } })).toBe(1);
    // Novo processo do worker retoma do estado persistido.
    await tick();
    expect(received).toHaveLength(1);
    expect(await prisma.outboxEvent.count({ where: { status: "pending" } })).toBe(0);
  });

  it("worker cai durante a tentativa: após o arrendamento a entrega volta a ser feita", async () => {
    await verifyOne();
    await fanOutOutbox();
    // Simula reivindicação por um worker que morreu antes de concluir o envio.
    await prisma.$executeRaw`UPDATE "WebhookDelivery" SET "lockedAt" = now(), "nextAttemptAt" = now() + interval '2 minutes'`;
    expect(await deliverDue()).toBe(0);
    await prisma.$executeRaw`UPDATE "WebhookDelivery" SET "nextAttemptAt" = now() - interval '1 second'`;
    expect(await deliverDue()).toBe(1);
    expect(received).toHaveLength(1);
  });

  it("falha HTTP agenda nova tentativa; após o limite fica 'failed' e permite reentrega com o mesmo event_id", async () => {
    respondWith = 500;
    await verifyOne();
    await tick();
    let d = await prisma.webhookDelivery.findFirstOrThrow();
    expect(d.status).toBe("pending");
    expect(d.lastStatusCode).toBe(500);
    expect(d.nextAttemptAt!.getTime() - Date.now()).toBeGreaterThan(5_000);

    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      await prisma.webhookDelivery.update({ where: { id: d.id }, data: { nextAttemptAt: new Date(Date.now() - 1) } });
      await deliverDue();
    }
    d = await prisma.webhookDelivery.findFirstOrThrow();
    expect(d.status).toBe("failed");
    expect(await prisma.webhookAttempt.count({ where: { deliveryId: d.id } })).toBe(MAX_ATTEMPTS);
    // Verificação continua aprovada mesmo com webhook falho.
    expect((await prisma.verification.findFirstOrThrow()).status).toBe("verified");

    respondWith = 200;
    expect(await redeliver(A.orgId, d.id)).toBe(true);
    await deliverDue();
    const ids = new Set(received.map((r) => r.headers["simvio-event-id"]));
    expect(ids.size).toBe(1);
    expect((await prisma.webhookDelivery.findFirstOrThrow()).status).toBe("succeeded");
    expect(await prisma.verification.count()).toBe(1);
  });

  it("redirect não é seguido", async () => {
    respondWith = 302;
    await verifyOne();
    await tick();
    expect(received).toHaveLength(1);
    expect((await prisma.webhookDelivery.findFirstOrThrow()).lastError).toBe("redirect_not_followed");
  });

  it("destino interno é bloqueado no envio quando o modo de desenvolvimento está desligado", async () => {
    config.WEBHOOK_ALLOW_PRIVATE_TARGETS = false;
    await verifyOne();
    await tick();
    expect(received).toHaveLength(0);
    const d = await prisma.webhookDelivery.findFirstOrThrow();
    expect(d.lastError).toMatch(/^blocked/);
  });
});

describe("proteção contra SSRF", () => {
  it("bloqueia loopback, privados, link-local, metadados e IPv6 equivalentes", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.5", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254", "64:ff9b::a9fe:a9fe"]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });

  it("exige HTTPS e recusa hosts internos na validação da URL", () => {
    config.WEBHOOK_ALLOW_PRIVATE_TARGETS = false;
    expect(() => validateWebhookUrl("http://example.com/hook")).toThrow();
    expect(() => validateWebhookUrl("https://127.0.0.1/hook")).toThrow();
    expect(() => validateWebhookUrl("https://[::1]/hook")).toThrow();
    expect(() => validateWebhookUrl("https://localhost/hook")).toThrow();
    expect(() => validateWebhookUrl("https://user:pw@example.com/hook")).toThrow();
    expect(validateWebhookUrl("https://example.com/hook").hostname).toBe("example.com");
  });
});
