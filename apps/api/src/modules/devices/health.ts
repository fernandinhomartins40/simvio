import { config } from "../../config.js";

export type DeviceHealth = "online" | "degraded" | "offline" | "revoked";

/**
 * "Visto recentemente" é melhor esforço: indica comunicação do app, não garante recepção de SMS.
 */
export function deviceHealth(d: { status: string; lastSeenAt: Date | null }, now = new Date()): DeviceHealth {
  if (d.status === "revoked") return "revoked";
  if (!d.lastSeenAt) return "offline";
  const age = (now.getTime() - d.lastSeenAt.getTime()) / 1000;
  if (age > config.DEVICE_OFFLINE_AFTER_SECONDS) return "offline";
  if (age > config.DEVICE_DEGRADED_AFTER_SECONDS) return "degraded";
  return "online";
}

/** O app informou no heartbeat que perdeu a permissão de SMS: não pode receber verificações. */
export function smsPermissionDenied(d: { diagnostics: unknown }) {
  return (d.diagnostics as { receive_sms_permission?: unknown } | null)?.receive_sms_permission === false;
}

export function onlineSince(now = new Date()): Date {
  return new Date(now.getTime() - config.DEVICE_OFFLINE_AFTER_SECONDS * 1000);
}
