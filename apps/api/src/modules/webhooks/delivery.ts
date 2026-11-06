import { createHmac } from "node:crypto";
import { Agent, request } from "undici";
import { config } from "../../config.js";
import { prisma } from "../../db.js";
import { decrypt } from "../../lib/crypto.js";
import { guardedLookup, SsrfError, validateWebhookUrl } from "../../lib/ssrf.js";

/** Intervalos sugeridos no PRD: imediato, 10s, 1min, 5min, 30min, 2h e 6h (7 tentativas). */
export const RETRY_DELAYS_MS = [0, 10_000, 60_000, 300_000, 1_800_000, 7_200_000, 21_600_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;
// Enquanto uma tentativa está em curso, a entrega fica "arrendada"; se o worker cair, volta a ser elegível.
const LEASE_MS = 2 * 60_000;

const agent = new Agent({
  connect: { lookup: guardedLookup, timeout: 5_000 },
  headersTimeout: config.WEBHOOK_TIMEOUT_MS,
  bodyTimeout: config.WEBHOOK_TIMEOUT_MS,
});

/**
 * Assinatura: HMAC-SHA256(segredo, `${timestamp}.${event_id}.${corpo_bruto}`), hex.
 * Cabeçalhos: Simvio-Event-Id, Simvio-Timestamp (segundos Unix), Simvio-Signature: v1=<hex>.
 */
export function signPayload(secret: string, timestamp: number, eventId: string, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${eventId}.${rawBody}`).digest("hex");
}

/** Distribui eventos pendentes do outbox para os endpoints ativos (transação única por lote). */
export async function fanOutOutbox(limit = 50): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const events = await tx.$queryRaw<
      { id: string; organizationId: string; applicationId: string; environment: "test" | "live" }[]
    >`SELECT id, "organizationId", "applicationId", environment FROM "OutboxEvent"
      WHERE status = 'pending' AND "availableAt" <= now()
      ORDER BY "createdAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED`;
    for (const ev of events) {
      const endpoints = await tx.webhookEndpoint.findMany({
        where: { organizationId: ev.organizationId, applicationId: ev.applicationId, environment: ev.environment, enabled: true },
        select: { id: true },
      });
      if (endpoints.length) {
        await tx.webhookDelivery.createMany({
          data: endpoints.map((e) => ({ organizationId: ev.organizationId, outboxEventId: ev.id, endpointId: e.id })),
          skipDuplicates: true,
        });
      }
      await tx.outboxEvent.update({ where: { id: ev.id }, data: { status: "done", processedAt: new Date() } });
    }
    return events.length;
  });
}

/** Reivindica entregas vencidas com SKIP LOCKED e arrenda por LEASE_MS. */
async function claimDeliveries(limit: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "WebhookDelivery" SET "lockedAt" = now(), "nextAttemptAt" = now() + (${LEASE_MS}::int * interval '1 millisecond')
    WHERE id IN (
      SELECT id FROM "WebhookDelivery"
      WHERE status = 'pending' AND "nextAttemptAt" <= now()
      ORDER BY "nextAttemptAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED
    ) RETURNING id`;
  return rows.map((r) => r.id);
}

export async function deliverDue(limit = 20): Promise<number> {
  const ids = await claimDeliveries(limit);
  await Promise.all(ids.map((id) => attemptDelivery(id)));
  return ids.length;
}

async function attemptDelivery(deliveryId: string) {
  const d = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true, outboxEvent: true },
  });
  if (!d || d.status !== "pending") return;

  const attemptNo = (await prisma.webhookAttempt.count({ where: { deliveryId } })) + 1;
  const started = Date.now();
  let statusCode: number | null = null;
  let error: string | null = null;

  if (!d.endpoint.enabled) {
    error = "endpoint_disabled";
  } else {
    try {
      const url = validateWebhookUrl(d.endpoint.url);
      const body = JSON.stringify(d.outboxEvent.payload);
      const ts = Math.floor(Date.now() / 1000);
      const sig = signPayload(decrypt(d.endpoint.secretEnc), ts, d.outboxEventId, body);
      const res = await request(url, {
        method: "POST",
        // undici 7 não segue redirects em request() (sem interceptor de redirect): 3xx é falha.
        dispatcher: agent,
        headers: {
          "content-type": "application/json",
          "user-agent": "Simvio-Webhooks/1.0",
          "simvio-event-id": d.outboxEventId,
          "simvio-event-type": d.outboxEvent.type,
          "simvio-timestamp": String(ts),
          "simvio-signature": `v1=${sig}`,
        },
        body,
        signal: AbortSignal.timeout(config.WEBHOOK_TIMEOUT_MS),
      });
      statusCode = res.statusCode;
      await res.body.dump({ limit: 64 * 1024 }).catch(() => undefined);
      if (statusCode < 200 || statusCode >= 300) {
        error = statusCode >= 300 && statusCode < 400 ? "redirect_not_followed" : `http_${statusCode}`;
      }
    } catch (err) {
      error = err instanceof SsrfError ? `blocked: ${err.message}` : describeNetworkError(err);
    }
  }

  const durationMs = Date.now() - started;
  const success = error === null;
  const cycleAttempt = d.attemptCount + 1;
  const exhausted = !success && (cycleAttempt >= MAX_ATTEMPTS || error === "endpoint_disabled");
  await prisma.$transaction([
    prisma.webhookAttempt.create({ data: { deliveryId, attemptNo, statusCode, error, durationMs } }),
    prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        attemptCount: cycleAttempt,
        lastStatusCode: statusCode,
        lastError: error,
        lockedAt: null,
        status: success ? "succeeded" : exhausted ? "failed" : "pending",
        deliveredAt: success ? new Date() : undefined,
        nextAttemptAt: success || exhausted ? null : new Date(Date.now() + RETRY_DELAYS_MS[cycleAttempt]!),
      },
    }),
  ]);
}

function describeNetworkError(err: unknown): string {
  const e = err as { code?: string; name?: string; message?: string; cause?: { code?: string; message?: string } };
  if (e.cause instanceof SsrfError) return `blocked: ${e.cause.message}`;
  if (e.name === "TimeoutError" || e.name === "AbortError") return "timeout";
  return (e.cause?.code || e.code || e.name || "network_error").toString().slice(0, 200);
}

/** Reentrega autorizada: reinicia o ciclo de tentativas sem criar nova verificação nem novo evento. */
export async function redeliver(organizationId: string, deliveryId: string) {
  const res = await prisma.webhookDelivery.updateMany({
    where: { id: deliveryId, organizationId, status: { in: ["failed", "succeeded"] } },
    data: { status: "pending", attemptCount: 0, nextAttemptAt: new Date(), lockedAt: null },
  });
  return res.count === 1;
}
