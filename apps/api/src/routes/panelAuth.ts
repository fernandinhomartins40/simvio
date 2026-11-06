import type { FastifyReply, FastifyRequest } from "fastify";
import { config, isProduction } from "../config.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import { assertCsrf, resolveSession, SESSION_COOKIE, type PanelSession } from "../modules/auth/service.js";

declare module "fastify" {
  interface FastifyRequest {
    panel?: PanelSession;
  }
}

const allowedOrigin = new URL(config.PUBLIC_BASE_URL).origin;

/** Requisições do navegador que mudam estado precisam vir da nossa origem. */
export function assertOrigin(req: FastifyRequest) {
  const origin = req.headers.origin;
  if (origin && origin !== allowedOrigin) throw forbidden("Origem não permitida.");
}

/** Sessão do painel: cookie HttpOnly + token CSRF em toda operação que altera dados. */
export async function requireSession(req: FastifyRequest): Promise<PanelSession> {
  const panel = await resolveSession(req.cookies[SESSION_COOKIE]);
  if (!panel) throw unauthorized("Sua sessão terminou. Entre novamente.");
  if (req.method !== "GET" && req.method !== "HEAD") {
    assertOrigin(req);
    assertCsrf(panel.session, req.headers["x-csrf-token"]);
  }
  req.panel = panel;
  return panel;
}

export function setSessionCookie(reply: FastifyReply, token: string, expires: Date) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    expires,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

export const limit = (max: number, timeWindow = "1 minute") => ({
  // Limites só valem fora dos testes automatizados, que disparam muitas requisições do mesmo IP.
  rateLimit: config.NODE_ENV === "test" ? false : { max, timeWindow },
});
