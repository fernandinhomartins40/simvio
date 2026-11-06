import type { Device, Prisma as P } from "@prisma/client";
import {
  buildChallengeMessage,
  CHALLENGE_TOKEN_LENGTH,
  formatPhone,
  isBrazilianMobileE164,
  maskPhone,
  normalizeSenderAddress,
  normalizeUserPhone,
} from "@simvio/contracts";
import { config } from "../../config.js";
import { Prisma, prisma } from "../../db.js";
import { audit } from "../../lib/audit.js";
import { keyedDigest, randomChallengeToken, randomToken, sha256 } from "../../lib/crypto.js";
import { ApiError, invalid, notFound, unauthorized } from "../../lib/errors.js";
import { getEntitlements } from "../plans.js";
import { smsUri, transition } from "../verifications/service.js";

const PAIRING_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // sem caracteres ambíguos

/** Código de pareamento legível (ex.: "K7QM-4TZX-9PRA"), ~59 bits, uso único e 5 min. */
function pairingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let s = "";
  for (const b of bytes) s += PAIRING_ALPHABET[b % PAIRING_ALPHABET.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

function normalizeCode(code: string) {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.length === 12 ? `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}` : clean;
}

// ---------------------------------------------------------------------------
// Pareamento

/** Criado no painel por proprietário/desenvolvedor. O QR contém só a URL da API e o código. */
export async function createPairing(organizationId: string, userId: string) {
  const ent = await getEntitlements(organizationId);
  if (ent.status === "suspended") throw new ApiError("suspended", "A organização está suspensa. Não é possível conectar aparelhos.");
  const active = await prisma.device.count({ where: { organizationId, status: "active" } });
  if (active >= ent.maxDevices) {
    throw new ApiError("plan_limit", `Seu plano permite ${ent.maxDevices} aparelho(s). Remova um aparelho ou altere o plano.`);
  }
  const code = pairingCode();
  const expiresAt = new Date(Date.now() + config.PAIRING_TTL_SECONDS * 1000);
  const pairing = await prisma.pairingSession.create({
    data: { organizationId, createdById: userId, codeDigest: sha256(code), expiresAt },
  });
  await audit({ organizationId, actorType: "user", actorId: userId, action: "device.pairing_created", targetType: "pairing", targetId: pairing.id });
  const apiBase = `${config.PUBLIC_BASE_URL}/api`;
  return {
    id: pairing.id,
    code,
    expires_at: expiresAt.toISOString(),
    api_base_url: apiBase,
    qr_payload: `simvio://pair?api=${encodeURIComponent(apiBase)}&code=${encodeURIComponent(code)}`,
  };
}

export interface PairInput {
  code: string;
  name?: string;
  manufacturer?: string;
  model?: string;
  android_version?: string;
  app_version?: string;
}

/** Troca o código de pareamento por uma credencial exclusiva do aparelho (exibida uma única vez). */
export async function completePairing(input: PairInput) {
  const now = new Date();
  const credential = `smv_dev_${randomToken(32)}`;
  const result = await prisma.$transaction(async (tx) => {
    // Consumo atômico: só uma requisição usa o código.
    const pairing = await tx.pairingSession.findUnique({ where: { codeDigest: sha256(normalizeCode(input.code)) } });
    if (!pairing || pairing.usedAt || pairing.expiresAt <= now) return null;
    const claimed = await tx.pairingSession.updateMany({
      where: { id: pairing.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return null;

    const ent = await getEntitlements(pairing.organizationId, tx);
    const active = await tx.device.count({ where: { organizationId: pairing.organizationId, status: "active" } });
    if (active >= ent.maxDevices) throw new ApiError("plan_limit", "Limite de aparelhos do plano atingido.");

    const device = await tx.device.create({
      data: {
        organizationId: pairing.organizationId,
        name: (input.name || input.model || "Android").slice(0, 80),
        manufacturer: input.manufacturer?.slice(0, 80),
        model: input.model?.slice(0, 80),
        androidVersion: input.android_version?.slice(0, 20),
        appVersion: input.app_version?.slice(0, 20),
        credentialDigest: sha256(credential),
        pairedById: pairing.createdById,
        lastSeenAt: now,
      },
    });
    await tx.pairingSession.update({ where: { id: pairing.id }, data: { deviceId: device.id } });
    await audit(
      { organizationId: pairing.organizationId, actorType: "device", actorId: device.id, action: "device.paired", targetType: "device", targetId: device.id, metadata: { model: device.model ?? null } },
      tx,
    );
    return device;
  });
  if (!result) throw new ApiError("invalid_request", "Código de pareamento inválido, expirado ou já usado.");
  return { device_id: result.id, device_credential: credential, organization_id: result.organizationId };
}

export async function authenticateDevice(authorization: string | undefined): Promise<Device> {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token.startsWith("smv_dev_")) throw unauthorized();
  const device = await prisma.device.findUnique({ where: { credentialDigest: sha256(token) } });
  if (!device) throw unauthorized();
  if (device.status !== "active") {
    // O app usa este código para apagar credenciais e dados locais.
    throw new ApiError("unauthorized", "Pareamento revogado.", { revoked: true });
  }
  return device;
}

// ---------------------------------------------------------------------------
// Heartbeat e linha receptora

export async function heartbeat(device: Device, diagnostics: P.InputJsonValue | undefined, appVersion?: string) {
  const now = new Date();
  await prisma.device.update({
    where: { id: device.id },
    data: { lastSeenAt: now, diagnostics, appVersion: appVersion?.slice(0, 20) ?? device.appVersion },
  });
  return deviceState(device.id);
}

export async function deviceState(deviceId: string) {
  const d = await prisma.device.findUniqueOrThrow({ where: { id: deviceId }, include: { line: true } });
  const line = d.line;
  const check =
    line && line.status === "pending_check" && line.checkExpiresAt && line.checkExpiresAt > new Date()
      ? line
      : null;
  return {
    device_id: d.id,
    name: d.name,
    status: d.status,
    server_time: new Date().toISOString(),
    line: line
      ? {
          phone_number: line.phoneE164,
          phone_display: formatPhone(line.phoneE164),
          status: line.status,
          verified_at: line.verifiedAt?.toISOString() ?? null,
          check_expires_at: check?.checkExpiresAt?.toISOString() ?? null,
        }
      : null,
  };
}

/**
 * Registra (ou troca) o número da linha receptora. O número digitado não é confiável:
 * a linha só fica ativa quando um SMS com o desafio, enviado PARA esse número, chega a este aparelho.
 */
export async function registerLine(device: Device, phone: string, actor: { type: "device" | "user"; id: string }) {
  const e164 = normalizeUserPhone(phone);
  if (!e164 || !isBrazilianMobileE164(e164)) {
    throw invalid("Informe o número do chip deste aparelho com DDD, ex.: (11) 98765-4321.", { field: "phone_number" });
  }
  const token = randomChallengeToken();
  const expiresAt = new Date(Date.now() + config.LINE_CHECK_TTL_SECONDS * 1000);
  await prisma.$transaction(async (tx) => {
    const existing = await tx.receiverLine.findUnique({ where: { deviceId: device.id } });
    // Troca de número/chip exige revalidar: sessões pendentes vinculadas falham de forma segura.
    if (existing && existing.status === "active") {
      const pend = await tx.verification.findMany({ where: { receiverLineId: existing.id, status: "pending" } });
      for (const v of pend) await transition(tx, v, "failed", { failureReason: "receiver_line_changed" });
    }
    await tx.receiverLine.upsert({
      where: { deviceId: device.id },
      create: {
        organizationId: device.organizationId,
        deviceId: device.id,
        phoneE164: e164,
        status: "pending_check",
        checkChallengeDigest: sha256(token),
        checkExpiresAt: expiresAt,
      },
      update: {
        phoneE164: e164,
        status: "pending_check",
        checkChallengeDigest: sha256(token),
        checkExpiresAt: expiresAt,
        verifiedAt: null,
        subscriptionId: null,
      },
    });
    await audit(
      { organizationId: device.organizationId, actorType: actor.type, actorId: actor.id, action: "device.line_registered", targetType: "device", targetId: device.id, metadata: { phone: maskPhone(e164) } },
      tx,
    );
  });
  const message = buildChallengeMessage(token);
  return {
    phone_number: e164,
    phone_display: formatPhone(e164),
    message_body: message,
    sms_uri: smsUri(e164, message),
    expires_at: expiresAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Eventos de SMS recebidos

export interface DeviceEventInput {
  event_id: string;
  sender: string;
  token: string;
  received_at?: string;
  /** Índice da assinatura (SIM) que recebeu o SMS, informado pelo Android quando disponível. */
  subscription_id?: number | null;
}

export type EventOutcome =
  | "verified"
  | "line_verified"
  | "rejected_sender"
  | "rejected_expired"
  | "rejected_not_pending"
  | "rejected_unknown"
  | "rejected_line_conflict"
  | "rejected_receiver_sim"
  | "rejected_invalid";

const TOKEN_RE = new RegExp(`^[A-Z2-7]{${CHALLENGE_TOKEN_LENGTH}}$`);

/**
 * Processa o evento de um SMS "SIMVIO <token>" recebido pelo aparelho autenticado.
 * Aprova somente se: credencial ativa, desafio conhecido, MESMA organização e MESMO aparelho/linha
 * fixados na sessão, remetente E.164 idêntico ao esperado e sessão pendente no prazo do SERVIDOR.
 * O horário informado pelo aparelho é apenas informativo.
 */
export async function processDeviceEvent(device: Device, input: DeviceEventInput) {
  if (!input.event_id || input.event_id.length > 128) throw invalid("event_id inválido.");

  const dup = await prisma.deviceEvent.findUnique({
    where: { deviceId_eventId: { deviceId: device.id, eventId: input.event_id } },
  });
  if (dup) return { event_id: input.event_id, outcome: dup.outcome as EventOutcome, duplicate: true };

  const now = new Date();
  const token = (input.token ?? "").trim().toUpperCase();
  const sender = normalizeSenderAddress(input.sender ?? "");
  const smsReceivedAt = input.received_at && !Number.isNaN(Date.parse(input.received_at)) ? new Date(input.received_at) : null;
  const digest = TOKEN_RE.test(token) ? sha256(token) : null;

  try {
    return await prisma.$transaction(async (tx) => {
      let outcome: EventOutcome = "rejected_unknown";
      let verificationId: string | null = null;

      const record = async () => {
        await tx.deviceEvent.create({
          data: {
            organizationId: device.organizationId,
            deviceId: device.id,
            eventId: input.event_id,
            outcome,
            verificationId,
            senderMasked: sender ? maskPhone(sender) : "remetente não numérico",
            smsReceivedAt,
          },
        });
        return { event_id: input.event_id, outcome, duplicate: false };
      };

      if (!digest) {
        outcome = "rejected_invalid";
        return record();
      }

      const v = await tx.verification.findUnique({ where: { challengeDigest: digest } });
      // Sessão de outra organização ou de outro receptor é tratada como desconhecida (não revela nada).
      if (v && v.organizationId === device.organizationId && v.deviceId === device.id) {
        const line = await tx.receiverLine.findUnique({ where: { deviceId: device.id } });
        verificationId = v.id;
        if (!line || line.id !== v.receiverLineId || line.status !== "active") {
          outcome = "rejected_unknown";
        } else if (line.subscriptionId !== null && line.subscriptionId !== (input.subscription_id ?? null)) {
          // SIM receptor ambíguo/diferente do validado: falha segura, sem aprovar.
          outcome = "rejected_receiver_sim";
        } else if (v.status !== "pending") {
          outcome = "rejected_not_pending";
        } else if (v.expiresAt <= now) {
          outcome = "rejected_expired";
          await transition(tx, v, "expired", { now });
        } else if (!sender || keyedDigest(sender) !== v.phoneDigest) {
          // Remetente divergente nunca aprova; a sessão legítima continua até o prazo.
          outcome = "rejected_sender";
        } else {
          const ok = await transition(tx, v, "verified", { now, requireNotExpired: true, matchedEventId: `${device.id}:${input.event_id}` });
          outcome = ok ? "verified" : "rejected_not_pending";
        }
        return record();
      }

      const line = await tx.receiverLine.findUnique({ where: { checkChallengeDigest: digest } });
      if (line && line.deviceId === device.id && line.organizationId === device.organizationId) {
        if (line.status !== "pending_check" || !line.checkExpiresAt || line.checkExpiresAt <= now) {
          outcome = "rejected_expired";
        } else {
          const taken = await tx.receiverLine.findFirst({
            where: { phoneE164: line.phoneE164, status: "active", id: { not: line.id } },
          });
          if (taken) {
            outcome = "rejected_line_conflict";
          } else {
            await tx.receiverLine.update({
              where: { id: line.id },
              data: {
                status: "active",
                verifiedAt: now,
                checkChallengeDigest: null,
                checkExpiresAt: null,
                subscriptionId: input.subscription_id ?? null,
              },
            });
            await audit(
              { organizationId: device.organizationId, actorType: "device", actorId: device.id, action: "device.line_verified", targetType: "device", targetId: device.id, metadata: { phone: maskPhone(line.phoneE164) } },
              tx,
            );
            outcome = "line_verified";
          }
        }
        return record();
      }

      return record();
    });
  } catch (err) {
    // Mesmo evento chegando em paralelo: a outra requisição gravou; resposta idempotente.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const again = await prisma.deviceEvent.findUnique({
        where: { deviceId_eventId: { deviceId: device.id, eventId: input.event_id } },
      });
      if (again) return { event_id: input.event_id, outcome: again.outcome as EventOutcome, duplicate: true };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Revogação

/** Revoga o aparelho: credencial deixa de valer e sessões pendentes vinculadas falham na hora. */
export async function revokeDevice(organizationId: string, deviceId: string, actor: { type: "user" | "superadmin" | "device"; id: string }, reason = "revoked") {
  const device = await prisma.device.findFirst({ where: { id: deviceId, organizationId } });
  if (!device) throw notFound("Aparelho");
  if (device.status === "revoked") return device;
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.device.update({ where: { id: device.id }, data: { status: "revoked", revokedAt: now } });
    await tx.receiverLine.updateMany({ where: { deviceId: device.id }, data: { status: "disabled", checkChallengeDigest: null } });
    const pend = await tx.verification.findMany({ where: { deviceId: device.id, status: "pending" } });
    for (const v of pend) await transition(tx, v, "failed", { now, failureReason: "receiver_revoked" });
    await audit(
      { organizationId, actorType: actor.type, actorId: actor.id, action: "device.revoked", targetType: "device", targetId: device.id, metadata: { reason, pending_failed: pend.length } },
      tx,
    );
  });
  return prisma.device.findUniqueOrThrow({ where: { id: device.id } });
}
