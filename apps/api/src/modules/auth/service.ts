import type { EmailTokenPurpose, User, WebSession } from "@prisma/client";
import { config } from "../../config.js";
import { prisma } from "../../db.js";
import { audit } from "../../lib/audit.js";
import { hashPassword, randomToken, safeEqual, sha256, verifyPassword } from "../../lib/crypto.js";
import { ApiError, forbidden, invalid, unauthorized } from "../../lib/errors.js";
import { mailConfigured, sendMail } from "../../lib/mail.js";
import { accountExistsMail, confirmEmailMail, passwordChangedMail, resetPasswordMail } from "../../lib/mail-templates.js";

export const SESSION_COOKIE = "simvio_session";
const SESSION_TTL_MS = 14 * 24 * 3600 * 1000;
const EMAIL_TOKEN_TTL_MS: Record<EmailTokenPurpose, number> = {
  verify_email: 48 * 3600 * 1000,
  reset_password: 3600 * 1000,
};

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

// Hash fixo para gastar o mesmo tempo quando o e-mail não existe.
const DUMMY_HASH = await hashPassword(randomToken(16));

/** Tokens vão no fragmento (#) da URL: o navegador não os envia ao servidor nem aos logs. */
function publicLink(path: string, token: string) {
  return `${config.PUBLIC_BASE_URL}${path}#token=${token}`;
}

async function issueEmailToken(userId: string, purpose: EmailTokenPurpose) {
  const token = randomToken(32);
  await prisma.emailToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.emailToken.create({
    data: { userId, purpose, tokenDigest: sha256(token), expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS[purpose]) },
  });
  return token;
}

async function sendVerification(user: Pick<User, "id" | "email" | "name">) {
  const token = await issueEmailToken(user.id, "verify_email");
  await sendMail(confirmEmailMail(user.email, user.name, publicLink("/confirmar-email", token)));
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  organization_name: string;
}

/**
 * A resposta é sempre a mesma, exista ou não a conta, para não revelar e-mails cadastrados.
 * Sem provedor de e-mail fora de produção, a conta já nasce confirmada.
 */
export async function register(input: RegisterInput) {
  const email = normalizeEmail(input.email);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await sendMail(accountExistsMail(email));
    return;
  }
  const autoVerify = !mailConfigured && config.NODE_ENV === "development";
  const user = await prisma.user.create({
    data: {
      email,
      name: input.name.trim(),
      passwordHash: await hashPassword(input.password),
      emailVerifiedAt: autoVerify ? new Date() : null,
      memberships: { create: { role: "owner", organization: { create: { name: input.organization_name.trim() } } } },
    },
    include: { memberships: true },
  });
  await audit({ organizationId: user.memberships[0]!.organizationId, actorType: "user", actorId: user.id, action: "organization.created" });
  if (!autoVerify) await sendVerification(user);
}

export async function createSession(userId: string, userAgent?: string) {
  const token = randomToken(32);
  const session = await prisma.webSession.create({
    data: {
      userId,
      tokenDigest: sha256(token),
      csrfToken: randomToken(24),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      userAgent: userAgent?.slice(0, 200),
    },
  });
  return { token, session };
}

export async function login(emailRaw: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(emailRaw) } });
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new ApiError("unauthorized", "E-mail ou senha incorretos.");
  if (!user.emailVerifiedAt) {
    throw new ApiError("forbidden", "Confirme seu e-mail para entrar. Veja sua caixa de entrada.", { reason: "email_not_verified" });
  }
  return user;
}

export interface PanelSession {
  session: WebSession;
  user: User;
}

export async function resolveSession(token: string | undefined): Promise<PanelSession | null> {
  if (!token) return null;
  const session = await prisma.webSession.findUnique({ where: { tokenDigest: sha256(token) }, include: { user: true } });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await prisma.webSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  const { user, ...rest } = session;
  return { session: rest, user };
}

export function assertCsrf(session: WebSession, header: unknown) {
  if (typeof header !== "string" || !safeEqual(header, session.csrfToken)) {
    throw forbidden("Sessão de segurança expirada. Recarregue a página.");
  }
}

export async function revokeSession(id: string) {
  await prisma.webSession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeAllSessions(userId: string) {
  await prisma.webSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

async function consumeEmailToken(token: string, purpose: EmailTokenPurpose) {
  const now = new Date();
  const rec = await prisma.emailToken.findUnique({ where: { tokenDigest: sha256(token) } });
  if (!rec || rec.purpose !== purpose || rec.usedAt || rec.expiresAt <= now) return null;
  const claimed = await prisma.emailToken.updateMany({ where: { id: rec.id, usedAt: null }, data: { usedAt: now } });
  return claimed.count === 1 ? rec : null;
}

export async function verifyEmail(token: string) {
  const rec = await consumeEmailToken(token, "verify_email");
  if (!rec) throw invalid("Link inválido ou expirado. Peça um novo.");
  await prisma.user.update({ where: { id: rec.userId }, data: { emailVerifiedAt: new Date() } });
}

export async function resendVerification(emailRaw: string) {
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(emailRaw) } });
  if (user && !user.emailVerifiedAt) await sendVerification(user);
}

export async function forgotPassword(emailRaw: string) {
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(emailRaw) } });
  if (!user) return;
  const token = await issueEmailToken(user.id, "reset_password");
  await sendMail(resetPasswordMail(user.email, publicLink("/redefinir-senha", token)));
}

export async function resetPassword(token: string, password: string) {
  const rec = await consumeEmailToken(token, "reset_password");
  if (!rec) throw invalid("Link inválido ou expirado. Peça um novo.");
  const user = await prisma.user.update({
    where: { id: rec.userId },
    // Quem acessou o link controla o e-mail: a conta fica confirmada.
    data: { passwordHash: await hashPassword(password), emailVerifiedAt: new Date() },
  });
  await revokeAllSessions(rec.userId);
  await audit({ actorType: "user", actorId: rec.userId, action: "user.password_reset" });
  await sendMail(passwordChangedMail(user.email));
}

export async function changePassword(user: User, current: string, next: string, keepSessionId: string) {
  if (!(await verifyPassword(current, user.passwordHash))) throw unauthorized("Senha atual incorreta.");
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  await prisma.webSession.updateMany({
    where: { userId: user.id, revokedAt: null, id: { not: keepSessionId } },
    data: { revokedAt: new Date() },
  });
  await audit({ actorType: "user", actorId: user.id, action: "user.password_changed" });
  await sendMail(passwordChangedMail(user.email));
}
