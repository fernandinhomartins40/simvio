import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  authenticateDevice,
  completePairing,
  deviceState,
  heartbeat,
  processDeviceEvent,
  registerLine,
  revokeDevice,
} from "../modules/devices/service.js";
import { noStore, parse } from "../lib/http.js";

const pairSchema = z.object({
  code: z.string().min(8).max(32),
  name: z.string().max(80).optional(),
  manufacturer: z.string().max(80).optional(),
  model: z.string().max(80).optional(),
  android_version: z.string().max(20).optional(),
  app_version: z.string().max(20).optional(),
});

// Diagnóstico declarado pelo app. Somente estados, nunca conteúdo de SMS.
const diagnosticsSchema = z
  .object({
    receive_sms_permission: z.boolean().optional(),
    notifications_permission: z.boolean().optional(),
    battery_optimization_ignored: z.boolean().optional(),
    background_restricted: z.boolean().optional(),
    pending_events: z.number().int().min(0).max(100000).optional(),
    last_sms_event_at: z.string().max(40).nullable().optional(),
    last_delivery_error: z.string().max(200).nullable().optional(),
    sim_count: z.number().int().min(0).max(8).nullable().optional(),
    network: z.string().max(20).optional(),
    manufacturer: z.string().max(80).optional(),
    model: z.string().max(80).optional(),
    android_version: z.string().max(20).optional(),
  })
  .strip();

const heartbeatSchema = z.object({
  app_version: z.string().max(20).optional(),
  diagnostics: diagnosticsSchema.optional(),
});

const eventSchema = z.object({
  event_id: z.string().min(8).max(128),
  sender: z.string().max(40),
  token: z.string().max(64),
  received_at: z.string().max(40).optional(),
  subscription_id: z.number().int().min(-1).max(1_000_000).nullable().optional(),
});

/** Endpoints do app Android receptor. Credencial exclusiva do aparelho (Bearer smv_dev_…). */
export async function deviceRoutes(app: FastifyInstance) {
  app.post(
    "/v1/devices/pair",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      noStore(reply);
      return reply.code(201).send(await completePairing(parse(pairSchema, req.body)));
    },
  );

  app.post("/v1/devices/heartbeat", async (req, reply) => {
    const device = await authenticateDevice(req.headers.authorization);
    const body = parse(heartbeatSchema, req.body ?? {});
    noStore(reply);
    return heartbeat(device, body.diagnostics, body.app_version);
  });

  app.get("/v1/devices/me", async (req, reply) => {
    const device = await authenticateDevice(req.headers.authorization);
    noStore(reply);
    return deviceState(device.id);
  });

  app.post(
    "/v1/devices/line",
    { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
    async (req, reply) => {
      const device = await authenticateDevice(req.headers.authorization);
      const { phone_number } = parse(z.object({ phone_number: z.string().min(8).max(25) }), req.body);
      noStore(reply);
      return registerLine(device, phone_number, { type: "device", id: device.id });
    },
  );

  // Desconexão iniciada no próprio aparelho: revoga a credencial e falha as pendências vinculadas.
  app.post("/v1/devices/unpair", async (req, reply) => {
    const device = await authenticateDevice(req.headers.authorization);
    await revokeDevice(device.organizationId, device.id, { type: "device", id: device.id }, "unpaired_on_device");
    noStore(reply);
    return { status: "revoked" };
  });

  app.post(
    "/v1/device-events",
    { config: { rateLimit: { max: 600, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const device = await authenticateDevice(req.headers.authorization);
      const body = parse(eventSchema, req.body);
      // Recebimento é prova de comunicação recente do app.
      await heartbeat(device, undefined);
      noStore(reply);
      return processDeviceEvent(device, body);
    },
  );
}
