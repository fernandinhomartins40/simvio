import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { safeEqual } from "../lib/crypto.js";
import { unauthorized } from "../lib/errors.js";
import { handleAsaasEvent } from "../modules/billing.js";

export async function billingRoutes(app: FastifyInstance) {
  app.post("/v1/billing/asaas/webhook", { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } }, async (req) => {
    const token = req.headers["asaas-access-token"];
    if (!config.ASAAS_WEBHOOK_TOKEN || typeof token !== "string" || !safeEqual(token, config.ASAAS_WEBHOOK_TOKEN)) throw unauthorized();
    // Falha na consulta ao Asaas devolve erro e o Asaas reenvia o aviso depois.
    const handled = await handleAsaasEvent((req.body ?? {}) as Parameters<typeof handleAsaasEvent>[0]);
    return { received: true, handled };
  });
}
