import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { prisma } from "../db.js";
import { purgeExpiredData } from "../modules/retention.js";
import { addDevice, bearer, createTenant, nextPhone, resetDb, type Tenant } from "./helpers.js";

let app: FastifyInstance;
let A: Tenant;

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
});

const DAY = 24 * 3600 * 1000;
const daysAgo = (d: number) => new Date(Date.now() - d * DAY);

let seq = 0;
async function verificationAt(createdAt: Date, status: "pending" | "verified" = "verified") {
  seq++;
  const line = await prisma.receiverLine.findUniqueOrThrow({ where: { deviceId: A.device.id } });
  return prisma.verification.create({
    data: {
      organizationId: A.orgId,
      applicationId: A.appId,
      environment: "test",
      reference: `r-${seq}`,
      purpose: "signup",
      phoneDigest: `d-${seq}`,
      phoneEnc: "cifrado",
      phoneMasked: "+55 11 9****-0000",
      deviceId: A.device.id,
      receiverLineId: line.id,
      receiverPhone: line.phoneE164,
      publicTokenDigest: `p-${seq}`,
      status,
      expiresAt: new Date(createdAt.getTime() + 300_000),
      ...(status === "verified" ? { verifiedAt: createdAt, terminalAt: createdAt } : {}),
      createdAt,
    },
  });
}

describe("retenção (PRD §12)", () => {
  it("apaga telefone em 7 dias, histórico em 30, auditoria em 90 e transitórios vencidos", async () => {
    const recent = await verificationAt(daysAgo(2));
    const week = await verificationAt(daysAgo(8));
    const old = await verificationAt(daysAgo(31));
    const oldPending = await verificationAt(daysAgo(31), "pending");
    await prisma.deviceEvent.createMany({
      data: [
        { organizationId: A.orgId, deviceId: A.device.id, eventId: "evt-novo", outcome: "verified", receivedAt: daysAgo(5) },
        { organizationId: A.orgId, deviceId: A.device.id, eventId: "evt-velho", outcome: "verified", receivedAt: daysAgo(31) },
      ],
    });
    await prisma.auditLog.createMany({
      data: [
        { organizationId: A.orgId, actorType: "user", action: "a.recente", createdAt: daysAgo(89) },
        { organizationId: A.orgId, actorType: "user", action: "a.velho", createdAt: daysAgo(91) },
      ],
    });
    await prisma.idempotencyRecord.createMany({
      data: [
        { organizationId: A.orgId, applicationId: A.appId, environment: "test", key: "vencida", requestHash: "h", verificationId: recent.id, expiresAt: daysAgo(1) },
        { organizationId: A.orgId, applicationId: A.appId, environment: "test", key: "valida", requestHash: "h", verificationId: recent.id, expiresAt: new Date(Date.now() + DAY) },
      ],
    });

    expect(await purgeExpiredData()).toBeGreaterThan(0);

    const find = (id: string) => prisma.verification.findUnique({ where: { id } });
    expect((await find(recent.id))?.phoneEnc).toBe("cifrado");
    const weekRow = await find(week.id);
    expect(weekRow).not.toBeNull();
    expect(weekRow?.phoneEnc).toBeNull();
    expect(weekRow?.phoneMasked).toBe("+55 11 9****-0000");
    expect(await find(old.id)).toBeNull();
    // Pendente nunca é apagada pela retenção (o worker a expira antes).
    expect(await find(oldPending.id)).not.toBeNull();
    expect((await prisma.deviceEvent.findMany()).map((e) => e.eventId)).toEqual(["evt-novo"]);
    expect((await prisma.auditLog.findMany({ where: { action: { startsWith: "a." } } })).map((a) => a.action)).toEqual(["a.recente"]);
    expect((await prisma.idempotencyRecord.findMany()).map((r) => r.key)).toEqual(["valida"]);

    // Idempotente: segunda execução não apaga mais nada do que ficou.
    await purgeExpiredData();
    expect(await find(recent.id)).not.toBeNull();
  });
});

describe("seleção do receptor e limite por aplicação", () => {
  let idem = 0;
  const create = () =>
    app.inject({
      method: "POST",
      url: "/v1/verifications",
      headers: { ...bearer(A.testKey), "idempotency-key": `k-${++idem}` },
      payload: { phone_number: nextPhone(), reference: `ref-${idem}` },
    });

  it("não usa aparelho que informou permissão de SMS negada", async () => {
    await prisma.device.update({ where: { id: A.device.id }, data: { diagnostics: { receive_sms_permission: false } } });
    const res = await create();
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("receiver_unavailable");

    const other = await addDevice(A.orgId);
    const ok = await create();
    expect(ok.statusCode).toBe(201);
    expect(ok.json().receiver_number).toBe(other.receiver);
  });

  it("limita criações por aplicação por minuto", async () => {
    const line = await prisma.receiverLine.findUniqueOrThrow({ where: { deviceId: A.device.id } });
    await prisma.verification.createMany({
      data: Array.from({ length: 120 }, (_, i) => ({
        organizationId: A.orgId,
        applicationId: A.appId,
        environment: "test" as const,
        reference: `lote-${i}`,
        purpose: "signup" as const,
        phoneDigest: `lote-${i}`,
        phoneMasked: "+55 11 9****-0000",
        deviceId: A.device.id,
        receiverLineId: line.id,
        receiverPhone: line.phoneE164,
        publicTokenDigest: `lote-${i}`,
        status: "cancelled" as const,
        terminalAt: new Date(),
        expiresAt: new Date(Date.now() + 300_000),
      })),
    });
    const res = await create();
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe("rate_limited");
  });
});
