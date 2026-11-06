import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { maskPhone } from "@simvio/contracts";
import { prisma } from "../db.js";
import { audit } from "../lib/audit.js";
import { decrypt, encrypt, randomToken, safeEqual, sha256 } from "../lib/crypto.js";
import { ApiError, invalid, notFound } from "../lib/errors.js";
import { noStore, parse } from "../lib/http.js";
import { generateTotpSecret, matchTotp, otpauthUri } from "../lib/totp.js";
import { deviceHealth } from "../modules/devices/health.js";
import { revokeDevice } from "../modules/devices/service.js";
import { getEntitlements } from "../modules/plans.js";
import { limit, requireSession } from "./panelAuth.js";

/** Verificação em dois fatores vale por 12 horas na mesma sessão. */
const MFA_WINDOW_MS = 12 * 3600 * 1000;
const RECOVERY_CODES = 10;

const mfaFresh = (at: Date | null) => !!at && Date.now() - at.getTime() < MFA_WINDOW_MS;

/** Quem não é superadmin recebe 404: a área de administração não se revela. */
async function superAdmin(req: FastifyRequest) {
  const panel = await requireSession(req);
  if (!panel.user.isSuperAdmin) throw notFound("Rota");
  return panel;
}

/** Toda rota administrativa exige superadmin com TOTP confirmado nesta sessão. */
async function adminContext(req: FastifyRequest) {
  const panel = await superAdmin(req);
  if (!panel.user.totpEnabledAt || !mfaFresh(panel.session.mfaVerifiedAt)) {
    throw new ApiError("forbidden", "Confirme o código do aplicativo autenticador para continuar.", {
      reason: "mfa_required",
      enrolled: !!panel.user.totpEnabledAt,
    });
  }
  return panel;
}

const code = z.string().trim().regex(/^\d{6}$/, "Digite os 6 números do aplicativo.");
const recoveryCode = z.string().trim().toLowerCase().regex(/^[a-z0-9]{5}-[a-z0-9]{5}$/, "Código de recuperação inválido.");
const reason = z.string().trim().min(3, "Explique o motivo.").max(500);

function newRecoveryCodes() {
  return Array.from({ length: RECOVERY_CODES }, () => {
    const raw = randomToken(16).toLowerCase().replace(/[^a-z0-9]/g, "").padEnd(10, "x").slice(0, 10);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

/** Aceita o código apenas se o passo for posterior ao último usado (impede repetir o mesmo código). */
async function acceptTotp(userId: string, secretEnc: string, lastStep: number | null, value: string) {
  const step = matchTotp(decrypt(secretEnc), value);
  if (step === null || (lastStep !== null && step <= lastStep)) return false;
  const claimed = await prisma.user.updateMany({
    where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
    data: { totpLastStep: step },
  });
  return claimed.count === 1;
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("onSend", async (_req, reply) => noStore(reply));

  // ------------------------------------------------------------------ dois fatores

  app.get("/v1/admin/mfa", async (req) => {
    const { user, session } = await superAdmin(req);
    return { enrolled: !!user.totpEnabledAt, verified: !!user.totpEnabledAt && mfaFresh(session.mfaVerifiedAt), recovery_codes_left: user.totpRecoveryDigests.length };
  });

  app.post("/v1/admin/mfa/setup", { config: limit(5) }, async (req) => {
    const { user } = await superAdmin(req);
    if (user.totpEnabledAt) throw new ApiError("conflict", "O aplicativo autenticador já está configurado.");
    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: user.id }, data: { totpSecretEnc: encrypt(secret), totpLastStep: null } });
    return { secret, otpauth_uri: otpauthUri(secret, user.email) };
  });

  app.post("/v1/admin/mfa/confirm", { config: limit(10) }, async (req) => {
    const { user, session } = await superAdmin(req);
    if (user.totpEnabledAt) throw new ApiError("conflict", "O aplicativo autenticador já está configurado.");
    if (!user.totpSecretEnc) throw invalid("Comece a configuração novamente.");
    const body = parse(z.object({ code }), req.body);
    if (!(await acceptTotp(user.id, user.totpSecretEnc, user.totpLastStep, body.code))) {
      throw invalid("Código incorreto. Confira o horário do celular e tente de novo.");
    }
    const codes = newRecoveryCodes();
    const now = new Date();
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { totpEnabledAt: now, totpRecoveryDigests: codes.map(sha256) } }),
      prisma.webSession.update({ where: { id: session.id }, data: { mfaVerifiedAt: now } }),
    ]);
    await audit({ actorType: "superadmin", actorId: user.id, action: "admin.mfa_enabled" });
    return { recovery_codes: codes };
  });

  app.post("/v1/admin/mfa/verify", { config: limit(5) }, async (req) => {
    const { user, session } = await superAdmin(req);
    if (!user.totpEnabledAt || !user.totpSecretEnc) throw invalid("Configure o aplicativo autenticador primeiro.");
    const body = parse(z.object({ code: code.optional(), recovery_code: recoveryCode.optional() }), req.body);
    let ok = false;
    let usedRecovery = false;
    if (body.code) {
      ok = await acceptTotp(user.id, user.totpSecretEnc, user.totpLastStep, body.code);
    } else if (body.recovery_code) {
      const digest = sha256(body.recovery_code);
      const match = user.totpRecoveryDigests.find((d) => safeEqual(d, digest));
      if (match) {
        // Consumo condicional: o mesmo código não serve duas vezes, nem em requisições simultâneas.
        const claimed = await prisma.user.updateMany({
          where: { id: user.id, totpRecoveryDigests: { has: match } },
          data: { totpRecoveryDigests: user.totpRecoveryDigests.filter((d) => d !== match) },
        });
        ok = usedRecovery = claimed.count === 1;
      }
    }
    if (!ok) {
      await audit({ actorType: "superadmin", actorId: user.id, action: "admin.mfa_failed" });
      throw invalid("Código incorreto. Tente de novo.");
    }
    await prisma.webSession.update({ where: { id: session.id }, data: { mfaVerifiedAt: new Date() } });
    if (usedRecovery) await audit({ actorType: "superadmin", actorId: user.id, action: "admin.mfa_recovery_used", metadata: { left: user.totpRecoveryDigests.length - 1 } });
    return { status: "ok" };
  });

  // ------------------------------------------------------------------ organizações

  app.get("/v1/admin/organizations", async (req) => {
    await adminContext(req);
    const q = parse(z.object({ q: z.string().trim().max(120).optional(), cursor: z.string().max(40).optional() }), req.query);
    const term = q.q || undefined;
    const rows = await prisma.organization.findMany({
      where: term
        ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { id: term }, { memberships: { some: { user: { email: { contains: term.toLowerCase() } } } } }] }
        : undefined,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        subscription: { include: { plan: true } },
        _count: { select: { memberships: true } },
      },
    });
    const page = rows.slice(0, 50);
    const ids = page.map((o) => o.id);
    const [devices, liveApps] = await Promise.all([
      prisma.device.groupBy({ by: ["organizationId"], where: { organizationId: { in: ids }, status: "active" }, _count: true }),
      prisma.application.groupBy({ by: ["organizationId"], where: { organizationId: { in: ids }, liveEnabled: true, archivedAt: null }, _count: true }),
    ]);
    const count = (list: { organizationId: string; _count: number }[], id: string) => list.find((r) => r.organizationId === id)?._count ?? 0;
    return {
      data: page.map((o) => ({
        id: o.id,
        name: o.name,
        created_at: o.createdAt.toISOString(),
        suspended: !!o.suspendedAt,
        plan: o.subscription && o.subscription.status !== "cancelled" ? { code: o.subscription.plan.code, name: o.subscription.plan.name } : null,
        subscription_status: o.subscription?.status ?? "sandbox",
        current_period_end: o.subscription?.currentPeriodEnd?.toISOString() ?? null,
        usage: { members: o._count.memberships, active_devices: count(devices, o.id), live_applications: count(liveApps, o.id) },
      })),
      next_cursor: rows.length > 50 ? page[page.length - 1]!.id : null,
    };
  });

  app.get("/v1/admin/organizations/:id", async (req) => {
    await adminContext(req);
    const { id } = req.params as { id: string };
    const org = await prisma.organization.findUnique({
      where: { id },
      include: {
        subscription: { include: { plan: true } },
        memberships: { include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } },
        applications: { orderBy: { createdAt: "asc" } },
        devices: { include: { line: true }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] },
      },
    });
    if (!org) throw notFound("Organização");
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [ent, verified30d, failedWebhooks] = await Promise.all([
      getEntitlements(org.id),
      prisma.verification.count({ where: { organizationId: org.id, status: "verified", createdAt: { gte: since } } }),
      prisma.webhookDelivery.count({ where: { organizationId: org.id, status: "failed", createdAt: { gte: since } } }),
    ]);
    return {
      id: org.id,
      name: org.name,
      created_at: org.createdAt.toISOString(),
      suspended_at: org.suspendedAt?.toISOString() ?? null,
      suspended_reason: org.suspendedReason,
      entitlements: { plan_name: ent.planName, status: ent.status, max_live_applications: ent.maxLiveApplications, max_devices: ent.maxDevices },
      subscription: org.subscription
        ? {
            plan_code: org.subscription.plan.code,
            status: org.subscription.status,
            current_period_end: org.subscription.currentPeriodEnd?.toISOString() ?? null,
            notes: org.subscription.notes,
            updated_at: org.subscription.updatedAt.toISOString(),
          }
        : null,
      stats: { verified_30d: verified30d, failed_webhooks_30d: failedWebhooks },
      members: org.memberships.map((m) => ({ name: m.user.name, email: m.user.email, role: m.role })),
      applications: org.applications.map((a) => ({ id: a.id, name: a.name, live_enabled: a.liveEnabled, archived: !!a.archivedAt })),
      devices: org.devices.map((d) => ({
        id: d.id,
        name: d.name,
        model: [d.manufacturer, d.model].filter(Boolean).join(" ") || null,
        status: d.status,
        health: deviceHealth(d),
        last_seen_at: d.lastSeenAt?.toISOString() ?? null,
        line: d.line ? { phone_masked: maskPhone(d.line.phoneE164), status: d.line.status } : null,
      })),
    };
  });

  app.post("/v1/admin/organizations/:id/suspend", async (req) => {
    const { user } = await adminContext(req);
    const { id } = req.params as { id: string };
    const body = parse(z.object({ reason }), req.body);
    const done = await prisma.organization.updateMany({ where: { id, suspendedAt: null }, data: { suspendedAt: new Date(), suspendedReason: body.reason } });
    if (!done.count && !(await prisma.organization.findUnique({ where: { id } }))) throw notFound("Organização");
    // Verificações pendentes continuam até expirar; novas ficam bloqueadas.
    if (done.count) await audit({ organizationId: id, actorType: "superadmin", actorId: user.id, action: "admin.organization_suspended", targetType: "organization", targetId: id, metadata: { reason: body.reason } });
    return { status: "ok" };
  });

  app.post("/v1/admin/organizations/:id/reactivate", async (req) => {
    const { user } = await adminContext(req);
    const { id } = req.params as { id: string };
    const body = parse(z.object({ reason }), req.body);
    const done = await prisma.organization.updateMany({ where: { id, suspendedAt: { not: null } }, data: { suspendedAt: null, suspendedReason: null } });
    if (!done.count && !(await prisma.organization.findUnique({ where: { id } }))) throw notFound("Organização");
    if (done.count) await audit({ organizationId: id, actorType: "superadmin", actorId: user.id, action: "admin.organization_reactivated", targetType: "organization", targetId: id, metadata: { reason: body.reason } });
    return { status: "ok" };
  });

  /** Cobrança manual no piloto: plano, situação e fim do período são definidos aqui, sempre auditados. */
  app.put("/v1/admin/organizations/:id/subscription", async (req) => {
    const { user } = await adminContext(req);
    const { id } = req.params as { id: string };
    const body = parse(
      z.object({
        plan_code: z.string().max(40).nullable(),
        status: z.enum(["active", "suspended", "cancelled"]).default("active"),
        current_period_end: z.iso.date().nullable().optional(),
        notes: z.string().trim().max(1000).nullable().optional(),
      }),
      req.body,
    );
    const org = await prisma.organization.findUnique({ where: { id }, include: { subscription: { include: { plan: true } } } });
    if (!org) throw notFound("Organização");
    const before = org.subscription ? { plan: org.subscription.plan.code, status: org.subscription.status, period_end: org.subscription.currentPeriodEnd?.toISOString() ?? null } : null;

    if (body.plan_code === null) {
      // Volta ao sandbox: produção deixa de ser permitida pelos limites.
      await prisma.subscription.deleteMany({ where: { organizationId: id } });
    } else {
      const plan = await prisma.plan.findUnique({ where: { code: body.plan_code } });
      if (!plan || !plan.active) throw invalid("Plano não encontrado.");
      const data = {
        planId: plan.id,
        status: body.status,
        currentPeriodEnd: body.current_period_end ? new Date(`${body.current_period_end}T23:59:59.000Z`) : null,
        notes: body.notes ?? null,
        updatedById: user.id,
      };
      await prisma.subscription.upsert({ where: { organizationId: id }, update: data, create: { organizationId: id, ...data } });
    }
    const after = body.plan_code === null ? null : { plan: body.plan_code, status: body.status, period_end: body.current_period_end ?? null };
    await audit({ organizationId: id, actorType: "superadmin", actorId: user.id, action: "admin.subscription_changed", targetType: "organization", targetId: id, metadata: { before, after } });
    return { status: "ok" };
  });

  app.post("/v1/admin/organizations/:id/devices/:deviceId/revoke", async (req) => {
    const { user } = await adminContext(req);
    const { id, deviceId } = req.params as { id: string; deviceId: string };
    const body = parse(z.object({ reason }), req.body);
    await revokeDevice(id, deviceId, { type: "superadmin", id: user.id }, body.reason);
    return { status: "ok" };
  });

  app.get("/v1/admin/plans", async (req) => {
    await adminContext(req);
    const plans = await prisma.plan.findMany({ orderBy: { priceCents: "asc" } });
    return plans.map((p) => ({ code: p.code, name: p.name, price_cents: p.priceCents, max_live_applications: p.maxLiveApplications, max_devices: p.maxDevices, active: p.active }));
  });

  app.get("/v1/admin/audit-logs", async (req) => {
    await adminContext(req);
    const q = parse(
      z.object({ organization_id: z.string().max(40).optional(), action: z.string().max(80).optional(), cursor: z.string().max(40).optional() }),
      req.query,
    );
    const rows = await prisma.auditLog.findMany({
      where: { organizationId: q.organization_id, action: q.action ? { startsWith: q.action } : undefined },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 101,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: { organization: { select: { name: true } } },
    });
    const page = rows.slice(0, 100);
    return {
      data: page.map((a) => ({
        id: a.id,
        at: a.createdAt.toISOString(),
        organization: a.organizationId ? { id: a.organizationId, name: a.organization?.name ?? null } : null,
        actor_type: a.actorType,
        actor_id: a.actorId,
        action: a.action,
        target_type: a.targetType,
        target_id: a.targetId,
        metadata: a.metadata,
      })),
      next_cursor: rows.length > 100 ? page[page.length - 1]!.id : null,
    };
  });
}
