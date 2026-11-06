import Fastify, { type FastifyError } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { ApiError } from "./lib/errors.js";
import { redactUrl } from "./lib/http.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { deviceRoutes } from "./routes/device.js";
import { integrationRoutes } from "./routes/integration.js";
import { mcpRoutes } from "./routes/mcp.js";
import { invitationRoutes, panelRoutes } from "./routes/panel.js";

export async function buildApp(opts: { logger?: boolean } = {}) {
  const app = Fastify({
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 64 * 1024,
    logger:
      opts.logger === false
        ? false
        : {
            level: config.LOG_LEVEL,
            // Sem PII nem segredos: nada de corpo, cabeçalhos de autenticação ou tokens de URL.
            redact: ["req.headers.authorization", "req.headers.cookie", "req.headers['idempotency-key']"],
            serializers: {
              req: (req) => ({ method: req.method, url: redactUrl(req.url) }),
              res: (res) => ({ statusCode: res.statusCode }),
            },
          },
  });

  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: { code: "rate_limited", message: "Muitas requisições. Aguarde um pouco e tente novamente." },
    }),
  });

  app.setErrorHandler((err: FastifyError | ApiError, req, reply) => {
    if (err instanceof ApiError) {
      return reply.code(err.status).send({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
    }
    if ((err as FastifyError).statusCode === 429) {
      return reply.code(429).send({ error: { code: "rate_limited", message: "Muitas requisições. Aguarde um pouco e tente novamente." } });
    }
    const status = (err as FastifyError).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ error: { code: "invalid_request", message: "Requisição inválida." } });
    }
    req.log.error({ err: { message: err.message, name: err.name, stack: err.stack } }, "erro interno");
    return reply.code(500).send({ error: { code: "internal_error", message: "Erro interno. Tente novamente." } });
  });

  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send({ error: { code: "not_found", message: "Rota não encontrada." } }),
  );

  // Liveness: processo vivo. Readiness: banco acessível. (Diferente do healthcheck do Nginx.)
  app.get("/healthz", { config: { rateLimit: false } }, async () => ({ status: "ok" }));
  app.get("/readyz", { config: { rateLimit: false } }, async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: "ready" };
    } catch {
      return reply.code(503).send({ status: "unavailable" });
    }
  });

  await app.register(integrationRoutes);
  await app.register(deviceRoutes);
  await app.register(authRoutes);
  await app.register(panelRoutes);
  await app.register(invitationRoutes);
  await app.register(adminRoutes);
  await app.register(mcpRoutes);

  return app;
}
