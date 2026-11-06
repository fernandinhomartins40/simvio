import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { noStore, parse } from "../lib/http.js";
import {
  changePassword,
  createSession,
  forgotPassword,
  login,
  register,
  resendVerification,
  resetPassword,
  revokeAllSessions,
  revokeSession,
  verifyEmail,
} from "../modules/auth/service.js";
import { assertOrigin, clearSessionCookie, limit, requireSession, setSessionCookie } from "./panelAuth.js";

const email = z.email().max(254);
const password = z.string().min(10, "Use ao menos 10 caracteres.").max(128);
const token = z.string().min(20).max(100);

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email,
  password,
  organization_name: z.string().trim().min(2).max(80),
});

export async function authRoutes(app: FastifyInstance) {
  app.addHook("onSend", async (_req, reply) => noStore(reply));

  app.post("/v1/auth/register", { config: limit(5) }, async (req, reply) => {
    assertOrigin(req);
    await register(parse(registerSchema, req.body));
    return reply.code(202).send({ status: "check_email" });
  });

  app.post("/v1/auth/login", { config: limit(10) }, async (req, reply) => {
    assertOrigin(req);
    const body = parse(z.object({ email, password: z.string().min(1).max(128) }), req.body);
    const user = await login(body.email, body.password);
    const { token: sessionToken, session } = await createSession(user.id, req.headers["user-agent"]);
    setSessionCookie(reply, sessionToken, session.expiresAt);
    return { status: "ok" };
  });

  app.post("/v1/auth/logout", async (req, reply) => {
    const { session } = await requireSession(req);
    await revokeSession(session.id);
    clearSessionCookie(reply);
    return { status: "ok" };
  });

  app.post("/v1/auth/logout-all", async (req, reply) => {
    const { user } = await requireSession(req);
    await revokeAllSessions(user.id);
    clearSessionCookie(reply);
    return { status: "ok" };
  });

  app.get("/v1/auth/me", async (req) => {
    const { user, session } = await requireSession(req);
    const memberships = await prisma.membership.findMany({
      where: { userId: user.id },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return {
      user: { id: user.id, name: user.name, email: user.email, is_super_admin: user.isSuperAdmin },
      csrf_token: session.csrfToken,
      organizations: memberships.map((m) => ({ id: m.organization.id, name: m.organization.name, role: m.role })),
    };
  });

  app.post("/v1/auth/verify-email", { config: limit(20) }, async (req) => {
    assertOrigin(req);
    await verifyEmail(parse(z.object({ token }), req.body).token);
    return { status: "ok" };
  });

  app.post("/v1/auth/resend-verification", { config: limit(3) }, async (req) => {
    assertOrigin(req);
    await resendVerification(parse(z.object({ email }), req.body).email);
    return { status: "ok" };
  });

  app.post("/v1/auth/forgot-password", { config: limit(5) }, async (req) => {
    assertOrigin(req);
    await forgotPassword(parse(z.object({ email }), req.body).email);
    return { status: "ok" };
  });

  app.post("/v1/auth/reset-password", { config: limit(10) }, async (req) => {
    assertOrigin(req);
    const body = parse(z.object({ token, password }), req.body);
    await resetPassword(body.token, body.password);
    return { status: "ok" };
  });

  app.post("/v1/auth/change-password", { config: limit(10) }, async (req) => {
    const { user, session } = await requireSession(req);
    const body = parse(z.object({ current_password: z.string().min(1).max(128), new_password: password }), req.body);
    await changePassword(user, body.current_password, body.new_password, session.id);
    return { status: "ok" };
  });
}
