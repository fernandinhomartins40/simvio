import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { maskPhone } from "@simvio/contracts";
import { prisma } from "../db.js";
import { audit } from "../lib/audit.js";
import { decrypt, encrypt, randomToken, safeEqual, sha256 } from "../lib/crypto.js";
import { ApiError, invalid, notFound } from "../lib/errors.js";
import { noStore, parse, redactUrl } from "../lib/http.js";
import { generateTotpSecret, matchTotp, otpauthUri } from "../lib/totp.js";
import { createSession, forgotPassword, login, normalizeEmail, resendVerification, revokeAllSessions } from "../modules/auth/service.js";
import { deviceHealth, onlineSince } from "../modules/devices/health.js";
import { revokeDevice } from "../modules/devices/service.js";
import { getEntitlements } from "../modules/plans.js";
import { assertOrigin, limit, requireSession, setSessionCookie } from "./panelAuth.js";

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

  // ------------------------------------------------------------------ login próprio

  /** Separado do login de clientes: só superadmin recebe sessão por aqui. */
  app.post("/v1/admin/login", { config: limit(10) }, async (req, reply) => {
    assertOrigin(req);
    const body = parse(z.object({ email: z.email().max(254), password: z.string().min(1).max(128) }), req.body);
    const user = await login(body.email, body.password, { superAdminOnly: true });
    const { token, session } = await createSession(user.id, req.headers["user-agent"]);
    setSessionCookie(reply, token, session.expiresAt);
    await audit({ actorType: "superadmin", actorId: user.id, action: "admin.login" });
    return { status: "ok" };
  });

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

  // ------------------------------------------------------------------ visão geral

  app.get("/v1/admin/overview", async (req) => {
    await adminContext(req);
    const now = Date.now();
    const days = (n: number) => new Date(now - n * 24 * 3600 * 1000);
    const offline = { status: "active" as const, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: onlineSince() } }] };
    const [organizations, suspended, signups7d, users, unverified, paying, devices, devicesOffline, created30d, verified30d, failedWebhooks, recent, attention] = await Promise.all([
      prisma.organization.count(),
      prisma.organization.count({ where: { suspendedAt: { not: null } } }),
      prisma.organization.count({ where: { createdAt: { gte: days(7) } } }),
      prisma.user.count(),
      prisma.user.count({ where: { emailVerifiedAt: null } }),
      prisma.subscription.findMany({ where: { status: "active", organization: { suspendedAt: null } }, select: { plan: { select: { priceCents: true } } } }),
      prisma.device.count({ where: { status: "active" } }),
      prisma.device.count({ where: offline }),
      prisma.verification.count({ where: { createdAt: { gte: days(30) } } }),
      prisma.verification.count({ where: { status: "verified", createdAt: { gte: days(30) } } }),
      prisma.webhookDelivery.count({ where: { status: "failed", createdAt: { gte: days(30) } } }),
      prisma.organization.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { id: true, name: true, createdAt: true } }),
      prisma.device.findMany({ where: offline, orderBy: { lastSeenAt: { sort: "asc", nulls: "first" } }, take: 10, include: { organization: { select: { id: true, name: true } } } }),
    ]);
    return {
      organizations: { total: organizations, suspended, paying: paying.length, signups_7d: signups7d },
      monthly_revenue_cents: paying.reduce((sum, s) => sum + s.plan.priceCents, 0),
      users: { total: users, unverified },
      devices: { active: devices, offline: devicesOffline },
      verifications_30d: { created: created30d, verified: verified30d },
      failed_webhooks_30d: failedWebhooks,
      recent_organizations: recent.map((o) => ({ id: o.id, name: o.name, created_at: o.createdAt.toISOString() })),
      offline_devices: attention.map((d) => ({ id: d.id, name: d.name, last_seen_at: d.lastSeenAt?.toISOString() ?? null, organization: d.organization })),
    };
  });

  // ------------------------------------------------------------------ organizações

  app.get("/v1/admin/organizations", async (req) => {
    await adminContext(req);
    const q = parse(
      z.object({ q: z.string().trim().max(120).optional(), status: z.enum(["suspended", "paying", "sandbox"]).optional(), cursor: z.string().max(40).optional() }),
      req.query,
    );
    const term = q.q || undefined;
    const statusFilter = {
      suspended: { suspendedAt: { not: null } },
      paying: { suspendedAt: null, subscription: { is: { status: "active" as const } } },
      sandbox: { suspendedAt: null, subscription: { is: null } },
    };
    const rows = await prisma.organization.findMany({
      where: {
        ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" as const } }, { id: term }, { memberships: { some: { user: { email: { contains: term.toLowerCase() } } } } }] } : {}),
        ...(q.status ? statusFilter[q.status] : {}),
      },
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
        memberships: { include: { user: { select: { id: true, name: true, email: true, emailVerifiedAt: true } } }, orderBy: { createdAt: "asc" } },
        applications: { orderBy: { createdAt: "asc" } },
        webhooks: { orderBy: { createdAt: "asc" }, include: { application: { select: { name: true } } } },
        verifications: { orderBy: { createdAt: "desc" }, take: 20, include: { application: { select: { name: true } } } },
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
      members: org.memberships.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, role: m.role, email_verified: !!m.user.emailVerifiedAt })),
      webhooks: org.webhooks.map((w) => ({ id: w.id, url: redactUrl(w.url), environment: w.environment, enabled: w.enabled, application: w.application.name })),
      verifications: org.verifications.map((v) => ({
        id: v.id,
        application: v.application.name,
        environment: v.environment,
        phone_masked: v.phoneMasked,
        status: v.status,
        failure_reason: v.failureReason,
        created_at: v.createdAt.toISOString(),
      })),
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

  app.patch("/v1/admin/organizations/:id", async (req) => {
    const { user } = await adminContext(req);
    const { id } = req.params as { id: string };
    const body = parse(z.object({ name: z.string().trim().min(2).max(80) }), req.body);
    const org = await prisma.organization.findUnique({ where: { id } });
    if (!org) throw notFound("Organização");
    await prisma.organization.update({ where: { id }, data: { name: body.name } });
    await audit({ organizationId: id, actorType: "superadmin", actorId: user.id, action: "admin.organization_renamed", targetType: "organization", targetId: id, metadata: { before: org.name, after: body.name } });
    return { status: "ok" };
  });

  /** Irreversível: exige repetir o nome. Contas sem outra organização saem junto; superadmin nunca. */
  app.post("/v1/admin/organizations/:id/delete", async (req) => {
    const { user } = await adminContext(req);
    const { id } = req.params as { id: string };
    const body = parse(z.object({ confirm_name: z.string().max(80), reason }), req.body);
    const org = await prisma.organization.findUnique({ where: { id }, include: { memberships: { include: { user: { include: { _count: { select: { memberships: true } } } } } } } });
    if (!org) throw notFound("Organização");
    if (body.confirm_name.trim() !== org.name) throw invalid("O nome digitado não confere.");
    const orphans = org.memberships.filter((m) => m.user._count.memberships === 1 && !m.user.isSuperAdmin).map((m) => m.userId);
    await prisma.$transaction([prisma.organization.delete({ where: { id } }), prisma.user.deleteMany({ where: { id: { in: orphans } } })]);
    // Sem organizationId: o registro sobrevive à exclusão.
    await audit({ actorType: "superadmin", actorId: user.id, action: "admin.organization_deleted", targetType: "organization", targetId: id, metadata: { name: org.name, reason: body.reason, users_removed: orphans.length } });
    return { status: "ok" };
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

  // ------------------------------------------------------------------ usuários

  app.get("/v1/admin/users", async (req) => {
    await adminContext(req);
    const q = parse(z.object({ q: z.string().trim().max(120).optional(), cursor: z.string().max(40).optional() }), req.query);
    const term = q.q || undefined;
    const rows = await prisma.user.findMany({
      where: term ? { OR: [{ email: { contains: normalizeEmail(term) } }, { name: { contains: term, mode: "insensitive" } }] } : undefined,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        memberships: { include: { organization: { select: { id: true, name: true } } } },
        sessions: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    });
    const page = rows.slice(0, 50);
    return {
      data: page.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        email_verified: !!u.emailVerifiedAt,
        is_super_admin: u.isSuperAdmin,
        created_at: u.createdAt.toISOString(),
        last_login_at: u.sessions[0]?.createdAt.toISOString() ?? null,
        organizations: u.memberships.map((m) => ({ id: m.organization.id, name: m.organization.name, role: m.role })),
      })),
      next_cursor: rows.length > 50 ? page[page.length - 1]!.id : null,
    };
  });

  app.post("/v1/admin/users/:id/:action", { config: limit(30) }, async (req) => {
    const { user: admin } = await adminContext(req);
    const { id, action } = parse(z.object({ id: z.string().max(40), action: z.enum(["confirm-email", "resend-confirmation", "send-reset", "end-sessions"]) }), req.params);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound("Usuário");
    if (action === "confirm-email") await prisma.user.update({ where: { id }, data: { emailVerifiedAt: target.emailVerifiedAt ?? new Date() } });
    if (action === "resend-confirmation") await resendVerification(target.email);
    if (action === "send-reset") await forgotPassword(target.email);
    if (action === "end-sessions") {
      if (id === admin.id) throw invalid("Para encerrar a sua própria sessão, use Sair.");
      await revokeAllSessions(id);
    }
    await audit({ actorType: "superadmin", actorId: admin.id, action: `admin.user_${action.replace(/-/g, "_")}`, targetType: "user", targetId: id });
    return { status: "ok" };
  });

  // ------------------------------------------------------------------ planos

  const planFields = {
    name: z.string().trim().min(2).max(60),
    price_cents: z.number().int().min(0).max(100_000_000),
    max_live_applications: z.number().int().min(0).max(10_000),
    max_devices: z.number().int().min(0).max(10_000),
    active: z.boolean(),
  };
  const planData = (b: { name: string; price_cents: number; max_live_applications: number; max_devices: number; active: boolean }) => ({
    name: b.name,
    priceCents: b.price_cents,
    maxLiveApplications: b.max_live_applications,
    maxDevices: b.max_devices,
    active: b.active,
  });

  app.get("/v1/admin/plans", async (req) => {
    await adminContext(req);
    const plans = await prisma.plan.findMany({ orderBy: { priceCents: "asc" }, include: { _count: { select: { subscriptions: true } } } });
    return plans.map((p) => ({ code: p.code, name: p.name, price_cents: p.priceCents, max_live_applications: p.maxLiveApplications, max_devices: p.maxDevices, active: p.active, subscribers: p._count.subscriptions }));
  });

  app.post("/v1/admin/plans", async (req) => {
    const { user } = await adminContext(req);
    const body = parse(z.object({ code: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, "Use letras minúsculas, números e hífen."), ...planFields }), req.body);
    if (await prisma.plan.findUnique({ where: { code: body.code } })) throw new ApiError("conflict", "Já existe um plano com esse código.");
    await prisma.plan.create({ data: { code: body.code, ...planData(body) } });
    await audit({ actorType: "superadmin", actorId: user.id, action: "admin.plan_created", targetType: "plan", targetId: body.code, metadata: { after: planData(body) } });
    return { status: "ok" };
  });

  /** Limites valem na hora para todos os assinantes do plano; desativar só impede novas contratações. */
  app.put("/v1/admin/plans/:code", async (req) => {
    const { user } = await adminContext(req);
    const { code } = req.params as { code: string };
    const body = parse(z.object(planFields), req.body);
    const plan = await prisma.plan.findUnique({ where: { code } });
    if (!plan) throw notFound("Plano");
    await prisma.plan.update({ where: { code }, data: planData(body) });
    await audit({
      actorType: "superadmin",
      actorId: user.id,
      action: "admin.plan_changed",
      targetType: "plan",
      targetId: code,
      metadata: { before: { name: plan.name, priceCents: plan.priceCents, maxLiveApplications: plan.maxLiveApplications, maxDevices: plan.maxDevices, active: plan.active }, after: planData(body) },
    });
    return { status: "ok" };
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
