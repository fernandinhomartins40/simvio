import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PURPOSES } from "@simvio/contracts";
import { authenticateApiKey } from "../modules/apikeys.js";
import {
  cancelVerification,
  createVerification,
  getPublicSession,
  getVerification,
  serializeVerification,
} from "../modules/verifications/service.js";
import { noStore, parse } from "../lib/http.js";

const createSchema = z.object({
  phone_number: z.string().min(8).max(20),
  reference: z.string().min(1).max(200),
  purpose: z.enum(PURPOSES).default("verification"),
  redirect_url: z.string().url().max(2000).optional(),
});

const idParam = z.object({ id: z.string().min(1).max(64) });

/** API do backend integrado (chave secreta) e estado público mínimo da página hospedada. */
export async function integrationRoutes(app: FastifyInstance) {
  app.post(
    "/v1/verifications",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const scope = await authenticateApiKey(req.headers.authorization);
      const body = parse(createSchema, req.body);
      const key = String(req.headers["idempotency-key"] ?? "");
      const { replayed, verification } = await createVerification(scope, body, key);
      noStore(reply);
      reply.header("idempotent-replayed", String(replayed));
      return reply.code(replayed ? 200 : 201).send(serializeVerification(verification));
    },
  );

  app.get("/v1/verifications/:id", async (req, reply) => {
    const scope = await authenticateApiKey(req.headers.authorization);
    const { id } = parse(idParam, req.params);
    noStore(reply);
    return serializeVerification(await getVerification(scope, id));
  });

  app.post("/v1/verifications/:id/cancel", async (req, reply) => {
    const scope = await authenticateApiKey(req.headers.authorization);
    const { id } = parse(idParam, req.params);
    noStore(reply);
    return serializeVerification(await cancelVerification(scope, id));
  });

  app.get(
    "/v1/public/sessions/:token",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { token } = parse(z.object({ token: z.string().max(100) }), req.params);
      noStore(reply);
      reply.header("referrer-policy", "no-referrer");
      reply.header("x-robots-tag", "noindex");
      return getPublicSession(token);
    },
  );
}
