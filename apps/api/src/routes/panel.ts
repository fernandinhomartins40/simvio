import { randomUUID } from "node:crypto";
import type { Environment, Role } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ENVIRONMENTS, ROLES } from "@simvio/contracts";
import { config, isProduction } from "../config.js";
import { prisma } from "../db.js";
import { audit, type Actor } from "../lib/audit.js";
import { encrypt, hashPassword, randomToken, sha256 } from "../lib/crypto.js";
import { ApiError, forbidden, invalid, notFound } from "../lib/errors.js";
import { noStore, parse } from "../lib/http.js";
import { sendMail } from "../lib/mail.js";
import { invitationMail } from "../lib/mail-templates.js";
import { SsrfError, validateWebhookUrl } from "../lib/ssrf.js";
import { normalizeEmail, resolveSession, SESSION_COOKIE } from "../modules/auth/service.js";
import { createAgentKey, revokeAgentKey, serializeAgentKey } from "../modules/agentKeys.js";
import { createApiKey, revokeApiKey } from "../modules/apikeys.js";
import { deviceHealth, smsPermissionDenied } from "../modules/devices/health.js";
import { createPairing, revokeDevice } from "../modules/devices/service.js";
import { billingEnabled, cancelBilling, checkout, OVERDUE_GRACE_MS, syncBilling } from "../modules/billing.js";
import { getEntitlements } from "../modules/plans.js";
import { createVerification, serializeVerification } from "../modules/verifications/service.js";
import { redeliver } from "../modules/webhooks/delivery.js";
import { assertOrigin, limit, newPassword, requireSession } from "./panelAuth.js";

const RANK: Record<Role, number> = { viewer: 0, developer: 1, owner: 2 };

/**
 * Resolve organização e papel a partir da sessão. Quem não é membro recebe 404:
 * a resposta não diferencia "não existe" de "é de outra organização".
 */
async function orgContext(req: FastifyRequest, min: Role = "viewer") {
  const { user } = await requireSession(req);
  const { orgId } = req.params as { orgId: string };
  const membership = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
  });
  if (!membership) throw notFound("Organização");
  if (RANK[membership.role] < RANK[min]) throw forbidden();
  return { orgId, user, role: membership.role };
}

export async function findApp(orgId: string, id: string) {
  const app = await prisma.application.findFirst({ where: { id, organizationId: orgId, archivedAt: null } });
  if (!app) throw notFound("Aplicação");
  return app;
}

const environment = z.enum(ENVIRONMENTS);
export const appBody = z.object({
  name: z.string().trim().min(2).max(80),
  display_name: z.string().trim().min(2).max(80),
});
export const redirectUrl = z.url().max(2000);

function assertRedirectUrl(raw: string) {
  const u = new URL(raw);
  const local = !isProduction && u.protocol === "http:";
  if (u.protocol !== "https:" && !local) throw invalid("Endereços de retorno precisam usar HTTPS.");
}

function assertWebhookUrl(raw: string) {
  try {
    validateWebhookUrl(raw);
  } catch (err) {
    if (err instanceof SsrfError) throw invalid(err.message, { field: "url" });
    throw err;
  }
}

export const serializeApp = (a: { id: string; name: string; displayName: string; liveEnabled: boolean; allowedRedirectUrls: string[]; createdAt: Date }) => ({
  id: a.id,
  name: a.name,
  display_name: a.displayName,
  live_enabled: a.liveEnabled,
  allowed_redirect_urls: a.allowedRedirectUrls,
  created_at: a.createdAt.toISOString(),
});

export const serializeKey = (k: { id: string; name: string; environment: Environment; prefix: string; lastUsedAt: Date | null; revokedAt: Date | null; createdAt: Date }) => ({
  id: k.id,
  name: k.name,
  environment: k.environment,
  prefix: k.prefix,
  last_used_at: k.lastUsedAt?.toISOString() ?? null,
  revoked_at: k.revokedAt?.toISOString() ?? null,
  created_at: k.createdAt.toISOString(),
});

const userActor = (id: string): Actor => ({ type: "user", id });

// Regras usadas pelo painel e pelo MCP (routes/mcp.ts): uma só implementação, muda só quem age.

export async function createApplication(orgId: string, body: z.infer<typeof appBody>, actor: Actor) {
  const created = await prisma.application.create({
    data: { organizationId: orgId, name: body.name, displayName: body.display_name },
  });
  await audit({ organizationId: orgId, actorType: actor.type, actorId: actor.id, action: "application.created", targetType: "application", targetId: created.id });
  return serializeApp(created);
}

export async function updateApplication(
  orgId: string,
  id: string,
  body: { name?: string; display_name?: string; allowed_redirect_urls?: string[] },
  actor: Actor,
) {
  await findApp(orgId, id);
  body.allowed_redirect_urls?.forEach(assertRedirectUrl);
  const updated = await prisma.application.update({
    where: { id },
    data: { name: body.name, displayName: body.display_name, allowedRedirectUrls: body.allowed_redirect_urls },
  });
  await audit({ organizationId: orgId, actorType: actor.type, actorId: actor.id, action: "application.updated", targetType: "application", targetId: id });
  return serializeApp(updated);
}

export async function createTestVerification(orgId: string, id: string, phone_number: string) {
  await findApp(orgId, id);
  const { verification } = await createVerification(
    { organizationId: orgId, applicationId: id, environment: "test" },
    { phone_number, reference: `painel-${randomUUID()}`, purpose: "verification" },
    randomUUID(),
  );
  return serializeVerification(verification);
}

export async function createAppKey(orgId: string, id: string, env: Environment, name: string, actor: Actor) {
  const target = await findApp(orgId, id);
  if (env === "live" && !target.liveEnabled) throw invalid("Habilite produção nesta aplicação antes de criar a chave.");
  const { key, secret } = await createApiKey(orgId, id, env, name, actor.id, actor.type);
  // A chave completa aparece só nesta resposta.
  return { ...serializeKey(key), secret };
}

export async function createWebhook(orgId: string, id: string, env: Environment, url: string, actor: Actor) {
  await findApp(orgId, id);
  assertWebhookUrl(url);
  const secret = `whsec_${randomToken(32)}`;
  const w = await prisma.webhookEndpoint.create({
    data: { organizationId: orgId, applicationId: id, environment: env, url, secretEnc: encrypt(secret) },
  });
  await audit({ organizationId: orgId, actorType: actor.type, actorId: actor.id, action: "webhook.created", targetType: "webhook", targetId: w.id });
  return { id: w.id, environment: w.environment, url: w.url, enabled: w.enabled, secret };
}

export async function redeliverWebhook(orgId: string, id: string, actor: Actor) {
  if (!(await redeliver(orgId, id))) throw notFound("Entrega");
  await audit({ organizationId: orgId, actorType: actor.type, actorId: actor.id, action: "webhook.redelivered", targetType: "delivery", targetId: id });
}

export const verificationFilter = z.object({
  status: z.enum(["pending", "verified", "expired", "cancelled", "failed"]).optional(),
  environment: environment.optional(),
  application_id: z.string().max(64).optional(),
  cursor: z.string().max(64).optional(),
});
type VerificationFilter = z.infer<typeof verificationFilter>;

export async function orgOverview(orgId: string) {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
  const [apps, keys, devices, verified, failed, webhookFailures, ent] = await Promise.all([
    prisma.application.count({ where: { organizationId: orgId, archivedAt: null } }),
    prisma.apiKey.count({ where: { organizationId: orgId, revokedAt: null } }),
    prisma.device.findMany({ where: { organizationId: orgId, status: "active" }, include: { line: true } }),
    prisma.verification.count({ where: { organizationId: orgId, status: "verified" } }),
    prisma.verification.findMany({
      where: { organizationId: orgId, status: "failed", createdAt: { gt: dayAgo } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, phoneMasked: true, failureReason: true, createdAt: true },
    }),
    prisma.webhookDelivery.count({ where: { organizationId: orgId, status: "failed", createdAt: { gt: dayAgo } } }),
    getEntitlements(orgId),
  ]);
  const deviceRows = devices.map((d) => ({
    id: d.id,
    name: d.name,
    health: deviceHealth(d, now),
    last_seen_at: d.lastSeenAt?.toISOString() ?? null,
    line_status: d.line?.status ?? null,
    sms_permission_denied: smsPermissionDenied(d),
  }));
  const readyDevice = deviceRows.some((d) => d.health !== "offline" && d.line_status === "active" && !d.sms_permission_denied);
  const steps = {
    application: apps > 0,
    api_key: keys > 0,
    device: devices.length > 0,
    line: devices.some((d) => d.line?.status === "active"),
    first_verification: verified > 0,
  };
  return {
    ready: readyDevice && steps.api_key && ent.status !== "suspended",
    steps,
    subscription_status: ent.status,
    problem_devices: deviceRows.filter((d) => d.health !== "online" || d.line_status !== "active" || d.sms_permission_denied),
    failed_verifications: failed.map((v) => ({ id: v.id, phone: v.phoneMasked, reason: v.failureReason, created_at: v.createdAt.toISOString() })),
    failed_webhooks_24h: webhookFailures,
    verified_total: verified,
  };
}

export async function listApplications(orgId: string) {
  const rows = await prisma.application.findMany({
    where: { organizationId: orgId, archivedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      apiKeys: { orderBy: { createdAt: "desc" } },
      webhooks: { orderBy: { createdAt: "asc" } },
    },
  });
  return rows.map((a) => ({
    ...serializeApp(a),
    keys: a.apiKeys.map(serializeKey),
    webhooks: a.webhooks.map((w) => ({ id: w.id, environment: w.environment, url: w.url, enabled: w.enabled, created_at: w.createdAt.toISOString() })),
  }));
}

export async function listDeliveries(orgId: string, q: { status?: "pending" | "succeeded" | "failed"; environment?: Environment }) {
  const rows = await prisma.webhookDelivery.findMany({
    where: { organizationId: orgId, status: q.status, ...(q.environment ? { outboxEvent: { environment: q.environment } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      endpoint: { select: { url: true } },
      outboxEvent: { select: { type: true, verificationId: true, environment: true } },
      attempts: { orderBy: { attemptNo: "desc" }, take: 10 },
    },
  });
  return rows.map((d) => ({
    id: d.id,
    event_id: d.outboxEventId,
    type: d.outboxEvent.type,
    environment: d.outboxEvent.environment,
    verification_id: d.outboxEvent.verificationId,
    url: d.endpoint.url,
    status: d.status,
    attempt_count: d.attemptCount,
    last_status_code: d.lastStatusCode,
    last_error: d.lastError,
    next_attempt_at: d.status === "pending" ? d.nextAttemptAt?.toISOString() ?? null : null,
    delivered_at: d.deliveredAt?.toISOString() ?? null,
    created_at: d.createdAt.toISOString(),
    attempts: d.attempts.map((a) => ({ number: a.attemptNo, status_code: a.statusCode, error: a.error, duration_ms: a.durationMs, at: a.createdAt.toISOString() })),
  }));
}

export async function listDevices(orgId: string) {
  const rows = await prisma.device.findMany({
    where: { organizationId: orgId },
    include: { line: true },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return rows.map((d) => ({
    id: d.id,
    name: d.name,
    manufacturer: d.manufacturer,
    model: d.model,
    android_version: d.androidVersion,
    app_version: d.appVersion,
    status: d.status,
    health: deviceHealth(d),
    last_seen_at: d.lastSeenAt?.toISOString() ?? null,
    paired_at: d.pairedAt.toISOString(),
    diagnostics: d.diagnostics,
    line: d.line
      ? { phone_number: d.line.phoneE164, status: d.line.status, verified_at: d.line.verifiedAt?.toISOString() ?? null }
      : null,
  }));
}

export async function listVerifications(orgId: string, q: VerificationFilter) {
  const rows = await prisma.verification.findMany({
    where: { organizationId: orgId, status: q.status, environment: q.environment, applicationId: q.application_id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 26,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    include: { application: { select: { name: true } } },
  });
  const page = rows.slice(0, 25);
  const events = await prisma.outboxEvent.findMany({
    where: { organizationId: orgId, verificationId: { in: page.map((v) => v.id) } },
    include: { deliveries: { select: { status: true } } },
  });
  const webhookOf = (id: string) => {
    const deliveries = events.filter((e) => e.verificationId === id).flatMap((e) => e.deliveries);
    if (!deliveries.length) return null;
    if (deliveries.some((d) => d.status === "failed")) return "failed";
    return deliveries.some((d) => d.status === "pending") ? "pending" : "succeeded";
  };
  const now = new Date();
  return {
    items: page.map((v) => ({
      id: v.id,
      application: v.application.name,
      environment: v.environment,
      phone: v.phoneMasked,
      purpose: v.purpose,
      reference: v.reference,
      // A leitura nunca mostra "pendente" além do prazo, mesmo antes do worker expirar.
      status: v.status === "pending" && v.expiresAt <= now ? "expired" : v.status,
      failure_reason: v.failureReason,
      webhook: webhookOf(v.id),
      created_at: v.createdAt.toISOString(),
      verified_at: v.verifiedAt?.toISOString() ?? null,
    })),
    next_cursor: rows.length > 25 ? page[24]!.id : null,
  };
}

export async function panelRoutes(app: FastifyInstance) {
  app.addHook("onSend", async (_req, reply) => noStore(reply));

  // ------------------------------------------------------------------ visão geral

  app.get("/v1/orgs/:orgId/overview", async (req) => orgOverview((await orgContext(req)).orgId));

  // ------------------------------------------------------------------ organização

  app.patch("/v1/orgs/:orgId", async (req) => {
    const { orgId, user } = await orgContext(req, "owner");
    const { name } = parse(z.object({ name: z.string().trim().min(2).max(80) }), req.body);
    await prisma.organization.update({ where: { id: orgId }, data: { name } });
    await audit({ organizationId: orgId, actorType: "user", actorId: user.id, action: "organization.updated" });
    return { status: "ok" };
  });

  // ------------------------------------------------------------------ aplicações

  app.get("/v1/orgs/:orgId/applications", async (req) => listApplications((await orgContext(req)).orgId));

  app.post("/v1/orgs/:orgId/applications", async (req, reply) => {
    const { orgId, user } = await orgContext(req, "developer");
    return reply.code(201).send(await createApplication(orgId, parse(appBody, req.body), userActor(user.id)));
  });

  app.patch("/v1/orgs/:orgId/applications/:id", async (req) => {
    const { orgId, user } = await orgContext(req, "developer");
    const body = parse(appBody.partial().extend({ allowed_redirect_urls: z.array(redirectUrl).max(20).optional() }), req.body);
    return updateApplication(orgId, (req.params as { id: string }).id, body, userActor(user.id));
  });

  app.post("/v1/orgs/:orgId/applications/:id/archive", async (req) => {
    const { orgId, user } = await orgContext(req, "developer");
    const { id } = req.params as { id: string };
    await findApp(orgId, id);
    await prisma.application.update({ where: { id }, data: { archivedAt: new Date(), liveEnabled: false } });
    await prisma.apiKey.updateMany({ where: { applicationId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit({ organizationId: orgId, actorType: "user", actorId: user.id, action: "application.archived", targetType: "application", targetId: id });
    return { status: "ok" };
  });

  // Produção conta para o limite do plano; o limite é aplicado aqui, no servidor.
  app.post("/v1/orgs/:orgId/applications/:id/live", async (req) => {
    const { orgId, user } = await orgContext(req, "developer");
    const { id } = req.params as { id: string };
    const { enabled } = parse(z.object({ enabled: z.boolean() }), req.body);
    const target = await findApp(orgId, id);
    if (enabled && !target.liveEnabled) {
      if (!user.emailVerifiedAt) throw forbidden("Confirme seu e-mail para habilitar produção.");
      const ent = await getEntitlements(orgId);
      if (ent.status === "suspended") throw new ApiError("suspended", "A assinatura está suspensa.");
      const used = await prisma.application.count({ where: { organizationId: orgId, liveEnabled: true, archivedAt: null } });
      if (used >= ent.maxLiveApplications) {
        throw new ApiError("plan_limit", `Seu plano permite ${ent.maxLiveApplications} aplicação(ões) em produção.`);
      }
    }
    const updated = await prisma.application.update({ where: { id }, data: { liveEnabled: enabled } });
    await audit({ organizationId: orgId, actorType: "user", actorId: user.id, action: enabled ? "application.live_enabled" : "application.live_disabled", targetType: "application", targetId: id });
    return serializeApp(updated);
  });

  // Teste real pelo painel: cria sessão de teste; o próprio operador envia o SMS.
  app.post("/v1/orgs/:orgId/applications/:id/test-verification", { config: limit(10) }, async (req, reply) => {
    const { orgId } = await orgContext(req, "developer");
    const { id } = req.params as { id: string };
    const { phone_number } = parse(z.object({ phone_number: z.string().min(8).max(25) }), req.body);
    return reply.code(201).send(await createTestVerification(orgId, id, phone_number));
  });

  // ------------------------------------------------------------------ chaves

  app.post("/v1/orgs/:orgId/applications/:id/keys", async (req, reply) => {
    const { orgId, user } = await orgContext(req, "developer");
    const { id } = req.params as { id: string };
    const body = parse(z.object({ environment, name: z.string().trim().min(1).max(80).default("Chave") }), req.body);
    return reply.code(201).send(await createAppKey(orgId, id, body.environment, body.name, userActor(user.id)));
  });

  app.post("/v1/orgs/:orgId/keys/:keyId/revoke", async (req) => {
    const { orgId, user } = await orgContext(req, "developer");
    await revokeApiKey(orgId, (req.params as { keyId: string }).keyId, user.id);
    return { status: "ok" };
  });

  // Rotação: nova chave no mesmo ambiente e revogação imediata da anterior.
  app.post("/v1/orgs/:orgId/keys/:keyId/rotate", async (req, reply) => {
    const { orgId, user } = await orgContext(req, "developer");
    const old = await prisma.apiKey.findFirst({ where: { id: (req.params as { keyId: string }).keyId, organizationId: orgId, revokedAt: null } });
    if (!old) throw notFound("Chave");
    const { key, secret } = await createApiKey(orgId, old.applicationId, old.environment, old.name, user.id);
    await revokeApiKey(orgId, old.id, user.id);
    return reply.code(201).send({ ...serializeKey(key), secret });
  });

  // ------------------------------------------------------------------ chaves de agente de IA

  // Só o painel cria e revoga: a chave de agente nunca gera outra chave de agente.
  app.get("/v1/orgs/:orgId/agent-keys", async (req) => {
    const { orgId } = await orgContext(req, "developer");
    const rows = await prisma.agentKey.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" } });
    return rows.map(serializeAgentKey);
  });

  app.post("/v1/orgs/:orgId/agent-keys", { config: limit(20) }, async (req, reply) => {
    const { orgId, user } = await orgContext(req, "developer");
    const body = parse(
      z.object({
        name: z.string().trim().min(1).max(80),
        allow_live: z.boolean().default(false),
        expires_in_days: z.number().int().min(1).max(365).nullable().default(null),
      }),
      req.body,
    );
    const { key, secret } = await createAgentKey(orgId, body.name, body.allow_live, body.expires_in_days, user.id);
    // A chave completa aparece só nesta resposta.
    return reply.code(201).send({ ...serializeAgentKey(key), secret });
  });

  app.post("/v1/orgs/:orgId/agent-keys/:id/revoke", async (req) => {
    const { orgId, user } = await orgContext(req, "developer");
    await revokeAgentKey(orgId, (req.params as { id: string }).id, user.id);
    return { status: "ok" };
  });

  // ------------------------------------------------------------------ webhooks

  app.post("/v1/orgs/:orgId/applications/:id/webhooks", async (req, reply) => {
    const { orgId, user } = await orgContext(req, "developer");
    const { id } = req.params as { id: string };
    const body = parse(z.object({ url: z.url().max(2000), environment }), req.body);
    return reply.code(201).send(await createWebhook(orgId, id, body.environment, body.url, userActor(user.id)));
  });

  const findWebhook = async (orgId: string, id: string) => {
    const w = await prisma.webhookEndpoint.findFirst({ where: { id, organizationId: orgId } });
    if (!w) throw notFound("Endereço de aviso");
    return w;
  };

  // Pausa o endpoint, nunca a assinatura: todo envio é assinado (sem opção de desligar).
  app.patch("/v1/orgs/:orgId/webhooks/:id", async (req) => {
    const { orgId, user } = await orgContext(req, "developer");
    const { id } = req.params as { id: string };
    await findWebhook(orgId, id);
    const body = parse(z.object({ url: z.url().max(2000).optional(), enabled: z.boolean().optional() }), req.body);
    if (body.url) assertWebhookUrl(body.url);
    const w = await prisma.webhookEndpoint.update({ where: { id }, data: { url: body.url, enabled: body.enabled } });
    await audit({ organizationId: orgId, actorType: "user", actorId: user.id, action: "webhook.updated", targetType: "webhook", targetId: id });
    return { id: w.id, environment: w.environment, url: w.url, enabled: w.enabled };
  });

  app.post("/v1/orgs/:orgId/webhooks/:id/rotate-secret", async (req) => {
    const { orgId, user } = await orgContext(req, "developer");
    const { id } = req.params as { id: string };
    await findWebhook(orgId, id);
    const secret = `whsec_${randomToken(32)}`;
    await prisma.webhookEndpoint.update({ where: { id }, data: { secretEnc: encrypt(secret) } });
    await audit({ organizationId: orgId, actorType: "user", actorId: user.id, action: "webhook.secret_rotated", targetType: "webhook", targetId: id });
    return { secret };
  });

  app.delete("/v1/orgs/:orgId/webhooks/:id", async (req) => {
    const { orgId, user } = await orgContext(req, "developer");
    const { id } = req.params as { id: string };
    await findWebhook(orgId, id);
    await prisma.webhookEndpoint.delete({ where: { id } });
    await audit({ organizationId: orgId, actorType: "user", actorId: user.id, action: "webhook.deleted", targetType: "webhook", targetId: id });
    return { status: "ok" };
  });

  app.get("/v1/orgs/:orgId/deliveries", async (req) => {
    const { orgId } = await orgContext(req);
    return listDeliveries(orgId, parse(z.object({ status: z.enum(["pending", "succeeded", "failed"]).optional(), environment: environment.optional() }), req.query));
  });

  app.post("/v1/orgs/:orgId/deliveries/:id/redeliver", async (req) => {
    const { orgId, user } = await orgContext(req, "developer");
    const { id } = req.params as { id: string };
    await redeliverWebhook(orgId, id, userActor(user.id));
    return { status: "ok" };
  });

  // ------------------------------------------------------------------ aparelhos

  app.get("/v1/orgs/:orgId/devices", async (req) => listDevices((await orgContext(req)).orgId));

  app.post("/v1/orgs/:orgId/pairings", { config: limit(10) }, async (req, reply) => {
    const { orgId, user } = await orgContext(req, "developer");
    return reply.code(201).send(await createPairing(orgId, user.id));
  });

  app.get("/v1/orgs/:orgId/pairings/:id", async (req) => {
    const { orgId } = await orgContext(req);
    const p = await prisma.pairingSession.findFirst({ where: { id: (req.params as { id: string }).id, organizationId: orgId } });
    if (!p) throw notFound("Pareamento");
    return { used: !!p.usedAt, device_id: p.deviceId, expires_at: p.expiresAt.toISOString() };
  });

  app.patch("/v1/orgs/:orgId/devices/:id", async (req) => {
    const { orgId } = await orgContext(req, "developer");
    const { id } = req.params as { id: string };
    const { name } = parse(z.object({ name: z.string().trim().min(1).max(80) }), req.body);
    const res = await prisma.device.updateMany({ where: { id, organizationId: orgId }, data: { name } });
    if (res.count !== 1) throw notFound("Aparelho");
    return { status: "ok" };
  });

  app.post("/v1/orgs/:orgId/devices/:id/revoke", async (req) => {
    const { orgId, user } = await orgContext(req, "developer");
    await revokeDevice(orgId, (req.params as { id: string }).id, { type: "user", id: user.id });
    return { status: "ok" };
  });

  // ------------------------------------------------------------------ verificações (histórico mascarado)

  app.get("/v1/orgs/:orgId/verifications", async (req) => {
    const { orgId } = await orgContext(req);
    return listVerifications(orgId, parse(verificationFilter, req.query));
  });

  // ------------------------------------------------------------------ equipe

  app.get("/v1/orgs/:orgId/members", async (req) => {
    const { orgId, role } = await orgContext(req);
    const [members, invitations] = await Promise.all([
      prisma.membership.findMany({ where: { organizationId: orgId }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
      role === "viewer"
        ? []
        : prisma.invitation.findMany({ where: { organizationId: orgId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
    ]);
    return {
      members: members.map((m) => ({ id: m.id, user_id: m.user.id, name: m.user.name, email: m.user.email, role: m.role, joined_at: m.createdAt.toISOString() })),
      invitations: invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, expires_at: i.expiresAt.toISOString() })),
    };
  });

  app.post("/v1/orgs/:orgId/invitations", { config: limit(20) }, async (req, reply) => {
    const { orgId, user } = await orgContext(req, "owner");
    const body = parse(z.object({ email: z.email().max(254), role: z.enum(ROLES) }), req.body);
    const email = normalizeEmail(body.email);
    const already = await prisma.membership.findFirst({ where: { organizationId: orgId, user: { email } } });
    if (already) throw new ApiError("conflict", "Esta pessoa já faz parte da equipe.");
    const token = randomToken(32);
    const inv = await prisma.invitation.create({
      data: { organizationId: orgId, email, role: body.role, tokenDigest: sha256(token), invitedById: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
      include: { organization: { select: { name: true } } },
    });
    await sendMail(invitationMail(email, user.name, inv.organization.name, `${config.PUBLIC_BASE_URL}/convite#token=${token}`));
    await audit({ organizationId: orgId, actorType: "user", actorId: user.id, action: "member.invited", targetType: "invitation", targetId: inv.id, metadata: { role: body.role } });
    return reply.code(201).send({ id: inv.id, email, role: inv.role, expires_at: inv.expiresAt.toISOString() });
  });

  app.delete("/v1/orgs/:orgId/invitations/:id", async (req) => {
    const { orgId, user } = await orgContext(req, "owner");
    const { id } = req.params as { id: string };
    const res = await prisma.invitation.updateMany({ where: { id, organizationId: orgId, acceptedAt: null }, data: { revokedAt: new Date() } });
    if (res.count !== 1) throw notFound("Convite");
    await audit({ organizationId: orgId, actorType: "user", actorId: user.id, action: "member.invitation_revoked", targetType: "invitation", targetId: id });
    return { status: "ok" };
  });

  const assertNotLastOwner = async (orgId: string, membershipRole: Role) => {
    if (membershipRole !== "owner") return;
    const owners = await prisma.membership.count({ where: { organizationId: orgId, role: "owner" } });
    if (owners <= 1) throw new ApiError("conflict", "A organização precisa de ao menos um proprietário.");
  };

  app.patch("/v1/orgs/:orgId/members/:id", async (req) => {
    const { orgId, user } = await orgContext(req, "owner");
    const { id } = req.params as { id: string };
    const { role } = parse(z.object({ role: z.enum(ROLES) }), req.body);
    const m = await prisma.membership.findFirst({ where: { id, organizationId: orgId } });
    if (!m) throw notFound("Membro");
    if (role !== "owner") await assertNotLastOwner(orgId, m.role);
    await prisma.membership.update({ where: { id }, data: { role } });
    await audit({ organizationId: orgId, actorType: "user", actorId: user.id, action: "member.role_changed", targetType: "membership", targetId: id, metadata: { from: m.role, to: role } });
    return { status: "ok" };
  });

  app.delete("/v1/orgs/:orgId/members/:id", async (req) => {
    const { orgId, user } = await orgContext(req, "owner");
    const { id } = req.params as { id: string };
    const m = await prisma.membership.findFirst({ where: { id, organizationId: orgId } });
    if (!m) throw notFound("Membro");
    await assertNotLastOwner(orgId, m.role);
    await prisma.membership.delete({ where: { id } });
    await audit({ organizationId: orgId, actorType: "user", actorId: user.id, action: "member.removed", targetType: "membership", targetId: id });
    return { status: "ok" };
  });

  // ------------------------------------------------------------------ assinatura e auditoria

  app.get("/v1/orgs/:orgId/subscription", async (req) => {
    const { orgId } = await orgContext(req);
    const [ent, liveApps, devices, plans, org] = await Promise.all([
      getEntitlements(orgId),
      prisma.application.count({ where: { organizationId: orgId, liveEnabled: true, archivedAt: null } }),
      prisma.device.count({ where: { organizationId: orgId, status: "active" } }),
      prisma.plan.findMany({ where: { active: true }, orderBy: { priceCents: "asc" } }),
      prisma.organization.findUniqueOrThrow({ where: { id: orgId } }),
    ]);
    return {
      plan_code: ent.planCode,
      plan_name: ent.planName,
      status: ent.status,
      limits: { live_applications: ent.maxLiveApplications, devices: ent.maxDevices },
      usage: { live_applications: liveApps, devices },
      plans: plans.map((p) => ({ code: p.code, name: p.name, price_cents: p.priceCents, live_applications: p.maxLiveApplications, devices: p.maxDevices })),
      billing: {
        enabled: billingEnabled(),
        active: !!org.asaasSubscriptionId,
        plan_code: org.billingPlanCode,
        invoice_url: org.billingInvoiceUrl,
        overdue_since: org.billingOverdueSince?.toISOString() ?? null,
        blocks_at: org.billingOverdueSince ? new Date(org.billingOverdueSince.getTime() + OVERDUE_GRACE_MS).toISOString() : null,
        ends_at: org.billingEndsAt?.toISOString() ?? null,
      },
    };
  });

  app.post("/v1/orgs/:orgId/billing/checkout", { config: limit(10) }, async (req) => {
    const { orgId, user } = await orgContext(req, "owner");
    const body = parse(
      z.object({
        plan_code: z.string().min(1).max(40),
        // Opcionais na troca de plano: o cliente já existe no Asaas.
        cpf_cnpj: z.string().transform((v) => v.replace(/\D/g, "")).refine((v) => v.length === 11 || v.length === 14, "Informe um CPF ou CNPJ.").optional(),
        name: z.string().trim().min(2).max(120).optional(),
        email: z.email().max(200).optional(),
      }),
      req.body,
    );
    const result = await checkout(orgId, body);
    await audit({ organizationId: orgId, actorType: "user", actorId: user.id, action: "billing.checkout", targetType: "organization", targetId: orgId, metadata: { plan: result.plan_code } });
    return result;
  });

  app.post("/v1/orgs/:orgId/billing/cancel", { config: limit(5) }, async (req) => {
    const { orgId, user } = await orgContext(req, "owner");
    const result = await cancelBilling(orgId);
    await audit({ organizationId: orgId, actorType: "user", actorId: user.id, action: "billing.cancelled", targetType: "organization", targetId: orgId, metadata: result });
    return result;
  });

  /** "Já paguei": consulta o Asaas na hora, sem esperar o webhook. */
  app.post("/v1/orgs/:orgId/billing/sync", { config: limit(10) }, async (req) => {
    const { orgId } = await orgContext(req);
    await syncBilling(orgId);
    return { status: "ok" };
  });

  app.get("/v1/orgs/:orgId/audit-logs", async (req) => {
    const { orgId } = await orgContext(req, "developer");
    const rows = await prisma.auditLog.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, take: 100 });
    return rows.map((a) => ({ id: a.id, action: a.action, actor_type: a.actorType, target_type: a.targetType, created_at: a.createdAt.toISOString() }));
  });
}

/** Aceite de convite: fica fora do contexto de organização (o token é a credencial). */
export async function invitationRoutes(app: FastifyInstance) {
  app.addHook("onSend", async (_req, reply) => noStore(reply));

  app.post("/v1/invitations/accept", { config: limit(10) }, async (req) => {
    assertOrigin(req);
    const body = parse(
      z.object({ token: z.string().min(20).max(100), name: z.string().trim().min(2).max(80).optional(), password: newPassword.optional() }),
      req.body,
    );
    const inv = await prisma.invitation.findUnique({ where: { tokenDigest: sha256(body.token) } });
    if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt <= new Date()) throw invalid("Convite inválido ou expirado.");

    let user = await prisma.user.findUnique({ where: { email: inv.email } });
    if (user) {
      // Conta existente: precisa estar logada como o próprio convidado.
      const panel = await resolveSession(req.cookies[SESSION_COOKIE]);
      if (panel?.user.id !== user.id) throw new ApiError("forbidden", "Entre com a conta convidada para aceitar.", { reason: "login_required" });
    } else {
      if (!body.name || !body.password) throw invalid("Informe nome e senha para criar sua conta.");
      user = await prisma.user.create({
        // O link chegou ao e-mail convidado: o endereço está confirmado.
        data: { email: inv.email, name: body.name, passwordHash: await hashPassword(body.password), emailVerifiedAt: new Date() },
      });
    }
    const claimed = await prisma.invitation.updateMany({ where: { id: inv.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
    if (claimed.count !== 1) throw invalid("Convite inválido ou expirado.");
    await prisma.membership.upsert({
      where: { organizationId_userId: { organizationId: inv.organizationId, userId: user.id } },
      update: {},
      create: { organizationId: inv.organizationId, userId: user.id, role: inv.role },
    });
    await audit({ organizationId: inv.organizationId, actorType: "user", actorId: user.id, action: "member.joined", targetType: "invitation", targetId: inv.id });
    return { status: "ok" };
  });
}
