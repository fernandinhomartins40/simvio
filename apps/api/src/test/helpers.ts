import type { Environment } from "@prisma/client";
import { prisma } from "../db.js";
import { randomToken, sha256 } from "../lib/crypto.js";
import { createApiKey } from "../modules/apikeys.js";

const TABLES = [
  "WebhookAttempt",
  "WebhookDelivery",
  "OutboxEvent",
  "WebhookEndpoint",
  "DeviceEvent",
  "IdempotencyRecord",
  "Verification",
  "PairingSession",
  "ReceiverLine",
  "Device",
  "ApiKey",
  "Application",
  "Invitation",
  "Membership",
  "Subscription",
  "AuditLog",
  "Organization",
  "EmailToken",
  "WebSession",
  "User",
];

export async function resetDb() {
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
}

let phoneSeq = 0;
/** Gera celulares válidos e distintos (+55 11 9XXXX-XXXX). */
export function nextPhone() {
  phoneSeq++;
  return `+55119${String(10000000 + phoneSeq).slice(-8)}`;
}

export interface Tenant {
  orgId: string;
  appId: string;
  testKey: string;
  liveKey: string;
  device: { id: string; credential: string; auth: string };
  receiver: string;
}

/** Organização com aplicação, chaves e um aparelho pareado com linha receptora ativa e online. */
export async function createTenant(name = "Org"): Promise<Tenant> {
  const org = await prisma.organization.create({ data: { name } });
  const app = await prisma.application.create({
    data: { organizationId: org.id, name: `${name} app`, displayName: `${name} Loja`, liveEnabled: true },
  });
  const plan = await prisma.plan.upsert({
    where: { code: "agencia" },
    update: {},
    create: { code: "agencia", name: "Agência", priceCents: 39900, maxLiveApplications: 20, maxDevices: 5 },
  });
  await prisma.subscription.create({ data: { organizationId: org.id, planId: plan.id } });
  const testKey = (await createApiKey(org.id, app.id, "test", "teste", null)).secret;
  const liveKey = (await createApiKey(org.id, app.id, "live", "produção", null)).secret;
  const device = await addDevice(org.id);
  return { orgId: org.id, appId: app.id, testKey, liveKey, device, receiver: device.receiver };
}

export async function addDevice(organizationId: string) {
  const credential = `smv_dev_${randomToken(32)}`;
  const receiver = nextPhone();
  const d = await prisma.device.create({
    data: { organizationId, name: "Android teste", credentialDigest: sha256(credential), lastSeenAt: new Date() },
  });
  await prisma.receiverLine.create({
    data: { organizationId, deviceId: d.id, phoneE164: receiver, status: "active", verifiedAt: new Date() },
  });
  return { id: d.id, credential, auth: `Bearer ${credential}`, receiver };
}

export function bearer(key: string) {
  return { authorization: `Bearer ${key}` };
}

export function tokenFromMessage(message: string) {
  return message.replace(/^SIMVIO\s+/, "");
}

export type { Environment };
