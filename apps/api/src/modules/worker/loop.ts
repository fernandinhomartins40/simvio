import { setTimeout as sleep } from "node:timers/promises";
import { config } from "../../config.js";
import { prisma } from "../../db.js";
import { purgeExpiredData } from "../retention.js";
import { expireDueVerifications } from "../verifications/service.js";
import { deliverDue, fanOutOutbox } from "../webhooks/delivery.js";

/**
 * Worker: mesmo código e imagem da API, sem porta HTTP.
 * Tudo o que ele faz é recuperável a partir do banco: se reiniciar, retoma do estado persistido.
 */
const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ level: "info", time: new Date().toISOString(), msg, ...extra }));
const logError = (msg: string, err: unknown) =>
  console.error(JSON.stringify({ level: "error", time: new Date().toISOString(), msg, error: (err as Error)?.message }));

let running = true;
let lastPurge = 0;

export async function tick() {
  const expired = await expireDueVerifications();
  const fanned = await fanOutOutbox();
  const delivered = await deliverDue();
  if (Date.now() - lastPurge > 3600_000) {
    lastPurge = Date.now();
    const purged = await purgeExpiredData();
    if (purged) log("retenção aplicada", { purged });
  }
  return { expired, fanned, delivered };
}

export async function runWorker() {
  log("worker iniciado");
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => {
      log("encerrando worker", { signal: sig });
      running = false;
    });
  }
  while (running) {
    try {
      const r = await tick();
      if (r.expired || r.fanned || r.delivered) log("ciclo", r);
    } catch (err) {
      logError("falha no ciclo do worker", err);
      await sleep(5000);
    }
    await sleep(config.WORKER_POLL_MS);
  }
  await prisma.$disconnect();
}

