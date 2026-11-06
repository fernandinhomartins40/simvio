import type { Environment, Purpose, Verification, VerificationStatus } from "@prisma/client";
import { buildChallengeMessage, formatPhone, isBrazilianMobileE164, maskPhone } from "@simvio/contracts";
import type { WebhookEventType } from "@simvio/contracts";
import { config } from "../../config.js";
import { Prisma, prisma, type Tx } from "../../db.js";
import {
  decrypt,
  encrypt,
  keyedDigest,
  randomChallengeToken,
  randomToken,
  sha256,
} from "../../lib/crypto.js";
import { ApiError, invalid, notFound } from "../../lib/errors.js";
import { onlineSince, smsPermissionDenied } from "../devices/health.js";
import { enqueueVerificationEvent } from "../outbox.js";
import { getEntitlements } from "../plans.js";

/** Escopo concedido por uma chave de API: uma aplicação em um ambiente. */
export interface AppScope {
  organizationId: string;
  applicationId: string;
  environment: Environment;
}

export interface CreateInput {
  phone_number: string;
  reference: string;
  purpose: Purpose;
  redirect_url?: string;
}

interface Envelope {
  /** token do desafio */
  t: string;
  /** token público da página hospedada */
  p: string;
}

const TERMINAL_EVENT: Record<Exclude<VerificationStatus, "pending">, WebhookEventType> = {
  verified: "verification.verified",
  expired: "verification.expired",
  cancelled: "verification.cancelled",
  failed: "verification.failed",
};

// Limite por telefone dentro da mesma aplicação: impede abuso sem permitir que um terceiro
// bloqueie o número em outra aplicação.
const PHONE_WINDOW_MS = 15 * 60 * 1000;
const PHONE_MAX_IN_WINDOW = 5;
// Limite por aplicação (PRD §12), além do limite por IP na rota.
const APP_WINDOW_MS = 60 * 1000;
const APP_MAX_IN_WINDOW = 120;

export function verificationUrl(publicToken: string) {
  return `${config.PUBLIC_BASE_URL}/v/${publicToken}`;
}

export function smsUri(receiver: string, message: string) {
  return `sms:${receiver}?body=${encodeURIComponent(message)}`;
}

function readEnvelope(v: Pick<Verification, "envelopeEnc">): Envelope | null {
  if (!v.envelopeEnc) return null;
  return JSON.parse(decrypt(v.envelopeEnc)) as Envelope;
}

function isLive(v: Pick<Verification, "status" | "expiresAt">, now = new Date()) {
  return v.status === "pending" && v.expiresAt > now;
}

/** Representação para o backend integrado (chave secreta). */
export function serializeVerification(v: Verification, now = new Date()) {
  const env = isLive(v, now) ? readEnvelope(v) : null;
  const message = env ? buildChallengeMessage(env.t) : null;
  return {
    id: v.id,
    object: "verification",
    status: v.status,
    purpose: v.purpose,
    reference: v.reference,
    environment: v.environment,
    application_id: v.applicationId,
    phone_number: v.phoneEnc ? decrypt(v.phoneEnc) : null,
    phone_masked: v.phoneMasked,
    receiver_number: v.receiverPhone,
    message_body: message,
    verification_url: env ? verificationUrl(env.p) : null,
    sms_uri: message ? smsUri(v.receiverPhone, message) : null,
    expires_at: v.expiresAt.toISOString(),
    verified_at: v.verifiedAt?.toISOString() ?? null,
    failure_reason: v.failureReason,
    created_at: v.createdAt.toISOString(),
  };
}

/**
 * Transição condicional pending → terminal. Só um chamador vence (UPDATE ... WHERE status='pending');
 * o evento de saída é criado na mesma transação. Retorna true se esta chamada aplicou a transição.
 */
export async function transition(
  tx: Tx,
  v: Verification,
  to: Exclude<VerificationStatus, "pending">,
  opts: { now?: Date; requireNotExpired?: boolean; failureReason?: string; matchedEventId?: string } = {},
): Promise<boolean> {
  const now = opts.now ?? new Date();
  const res = await tx.verification.updateMany({
    where: {
      id: v.id,
      status: "pending",
      ...(opts.requireNotExpired ? { expiresAt: { gt: now } } : {}),
    },
    data: {
      status: to,
      terminalAt: now,
      verifiedAt: to === "verified" ? now : undefined,
      failureReason: opts.failureReason,
      matchedEventId: opts.matchedEventId,
      // Desafio e envelope deixam de existir: nada mais pode ser aprovado com eles.
      envelopeEnc: null,
      challengeDigest: null,
    },
  });
  if (res.count !== 1) return false;
  await enqueueVerificationEvent(tx, TERMINAL_EVENT[to], v, to, now);
  return true;
}

/** Expira (se vencida) uma verificação pendente. Usado em toda leitura, independente do worker. */
async function settleExpiry(v: Verification, now = new Date()): Promise<Verification> {
  if (v.status !== "pending" || v.expiresAt > now) return v;
  await prisma.$transaction((tx) => transition(tx, v, "expired", { now }));
  return prisma.verification.findUniqueOrThrow({ where: { id: v.id } });
}

function requestHash(input: CreateInput) {
  return sha256(
    JSON.stringify([input.phone_number, input.reference, input.purpose, input.redirect_url ?? null]),
  );
}

export async function createVerification(scope: AppScope, input: CreateInput, idempotencyKey: string) {
  if (!isBrazilianMobileE164(input.phone_number)) {
    throw invalid("phone_number deve ser um celular brasileiro em E.164, ex.: +5511987654321.", {
      field: "phone_number",
    });
  }
  if (!idempotencyKey || idempotencyKey.length > 200) {
    throw invalid("Cabeçalho Idempotency-Key é obrigatório (até 200 caracteres).");
  }
  const hash = requestHash(input);
  const now = new Date();

  const replay = await findIdempotentReplay(scope, idempotencyKey, hash, now);
  if (replay) return { replayed: true, verification: replay };

  const app = await prisma.application.findFirst({
    where: { id: scope.applicationId, organizationId: scope.organizationId, archivedAt: null },
  });
  if (!app) throw notFound("Aplicação");

  const ent = await getEntitlements(scope.organizationId);
  if (ent.status === "suspended") {
    throw new ApiError("suspended", "A assinatura desta organização está suspensa. Novas verificações estão bloqueadas.");
  }
  if (scope.environment === "live" && (!app.liveEnabled || ent.maxLiveApplications === 0)) {
    throw new ApiError("plan_limit", "O ambiente de produção não está habilitado para esta aplicação.");
  }
  if (input.redirect_url && !app.allowedRedirectUrls.includes(input.redirect_url)) {
    throw invalid("redirect_url não está cadastrada nesta aplicação.", { field: "redirect_url" });
  }

  const phoneDigest = keyedDigest(input.phone_number);
  const recent = await prisma.verification.count({
    where: {
      applicationId: scope.applicationId,
      phoneDigest,
      createdAt: { gt: new Date(now.getTime() - PHONE_WINDOW_MS) },
    },
  });
  if (recent >= PHONE_MAX_IN_WINDOW) {
    throw new ApiError("rate_limited", "Muitas verificações para este número. Tente novamente em alguns minutos.");
  }

  const appRecent = await prisma.verification.count({
    where: { applicationId: scope.applicationId, createdAt: { gt: new Date(now.getTime() - APP_WINDOW_MS) } },
  });
  if (appRecent >= APP_MAX_IN_WINDOW) {
    throw new ApiError("rate_limited", "Muitas verificações criadas por esta aplicação. Aguarde um minuto.");
  }

  // Receptor: linha ativa, aparelho ativo, com comunicação recente e sem permissão de SMS negada.
  // Preferir o mais recente.
  const candidates = await prisma.receiverLine.findMany({
    where: {
      organizationId: scope.organizationId,
      status: "active",
      device: { status: "active", lastSeenAt: { gt: onlineSince(now) } },
    },
    include: { device: { select: { diagnostics: true } } },
    orderBy: { device: { lastSeenAt: "desc" } },
  });
  const line = candidates.find((l) => !smsPermissionDenied(l.device));
  if (!line) {
    throw new ApiError(
      "receiver_unavailable",
      "Nenhum aparelho receptor disponível agora. Verifique se o Android está conectado e tente novamente.",
    );
  }

  const token = randomChallengeToken();
  const publicToken = randomToken(24);
  const expiresAt = new Date(now.getTime() + config.VERIFICATION_TTL_SECONDS * 1000);

  try {
    const created = await prisma.$transaction(async (tx) => {
      // Nova sessão para a mesma transação invalida a anterior.
      const previous = await tx.verification.findMany({
        where: {
          applicationId: scope.applicationId,
          environment: scope.environment,
          reference: input.reference,
          status: "pending",
        },
      });
      for (const p of previous) {
        await transition(tx, p, "cancelled", { now, failureReason: "superseded" });
      }

      const v = await tx.verification.create({
        data: {
          organizationId: scope.organizationId,
          applicationId: scope.applicationId,
          environment: scope.environment,
          reference: input.reference,
          purpose: input.purpose,
          phoneDigest,
          phoneEnc: encrypt(input.phone_number),
          phoneMasked: maskPhone(input.phone_number),
          deviceId: line.deviceId,
          receiverLineId: line.id,
          receiverPhone: line.phoneE164,
          challengeDigest: sha256(token),
          publicTokenDigest: sha256(publicToken),
          envelopeEnc: encrypt(JSON.stringify({ t: token, p: publicToken } satisfies Envelope)),
          redirectUrl: input.redirect_url,
          expiresAt,
        },
      });
      await tx.idempotencyRecord.create({
        data: {
          organizationId: scope.organizationId,
          applicationId: scope.applicationId,
          environment: scope.environment,
          key: idempotencyKey,
          requestHash: hash,
          verificationId: v.id,
          expiresAt: new Date(now.getTime() + config.IDEMPOTENCY_TTL_HOURS * 3600 * 1000),
        },
      });
      return v;
    });
    return { replayed: false, verification: created };
  } catch (err) {
    // Corrida com a mesma Idempotency-Key: a outra requisição venceu; devolvemos o resultado dela.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const again = await findIdempotentReplay(scope, idempotencyKey, hash, new Date());
      if (again) return { replayed: true, verification: again };
    }
    throw err;
  }
}

async function findIdempotentReplay(scope: AppScope, key: string, hash: string, now: Date) {
  const rec = await prisma.idempotencyRecord.findUnique({
    where: {
      organizationId_applicationId_environment_key: {
        organizationId: scope.organizationId,
        applicationId: scope.applicationId,
        environment: scope.environment,
        key,
      },
    },
  });
  if (!rec) return null;
  if (rec.expiresAt <= now) {
    await prisma.idempotencyRecord.deleteMany({ where: { id: rec.id, expiresAt: { lte: now } } });
    return null;
  }
  if (rec.requestHash !== hash) {
    throw new ApiError("conflict", "Idempotency-Key já usada com outro conteúdo.");
  }
  const v = await settleExpiry(await prisma.verification.findUniqueOrThrow({ where: { id: rec.verificationId } }), now);
  if (!isLive(v, now)) {
    // Depois de terminal/expirada, o segredo não é devolvido novamente.
    throw new ApiError("conflict", "Esta verificação não está mais pendente. Use nova Idempotency-Key.", {
      verification_id: v.id,
      status: v.status,
    });
  }
  return v;
}

async function findScoped(scope: AppScope, id: string) {
  const v = await prisma.verification.findFirst({
    where: {
      id,
      organizationId: scope.organizationId,
      applicationId: scope.applicationId,
      environment: scope.environment,
    },
  });
  if (!v) throw notFound("Verificação");
  return v;
}

export async function getVerification(scope: AppScope, id: string) {
  return settleExpiry(await findScoped(scope, id));
}

export async function cancelVerification(scope: AppScope, id: string) {
  const v = await getVerification(scope, id);
  if (v.status === "cancelled") return v;
  if (v.status !== "pending") {
    throw new ApiError("conflict", `Verificação já está em estado final (${v.status}).`, { status: v.status });
  }
  const now = new Date();
  const applied = await prisma.$transaction((tx) =>
    transition(tx, v, "cancelled", { now, requireNotExpired: true, failureReason: "cancelled_by_integrator" }),
  );
  const after = await settleExpiry(await prisma.verification.findUniqueOrThrow({ where: { id } }), now);
  if (!applied && after.status !== "cancelled") {
    throw new ApiError("conflict", `Verificação já está em estado final (${after.status}).`, { status: after.status });
  }
  return after;
}

/** Estado mínimo para a página hospedada (credencial efêmera: token opaco da URL). */
export async function getPublicSession(publicToken: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(publicToken)) throw notFound("Sessão");
  const found = await prisma.verification.findUnique({
    where: { publicTokenDigest: sha256(publicToken) },
    include: { application: { select: { displayName: true } } },
  });
  if (!found) throw notFound("Sessão");
  const now = new Date();
  const v = await settleExpiry(found, now);
  const env = isLive(v, now) ? readEnvelope(v) : null;
  const message = env ? buildChallengeMessage(env.t) : null;
  // Orientação ao usuário: houve SMS com este desafio vindo de outra linha (dual SIM / número errado).
  const wrongSender =
    v.status === "pending" &&
    (await prisma.deviceEvent.count({ where: { verificationId: v.id, outcome: "rejected_sender" } })) > 0;
  return {
    status: v.status,
    hint: wrongSender ? "wrong_sender" : null,
    application_name: found.application.displayName,
    phone_hint: v.phoneMasked,
    receiver_number: message ? v.receiverPhone : null,
    receiver_display: message ? formatPhone(v.receiverPhone) : null,
    message_body: message,
    sms_uri: message ? smsUri(v.receiverPhone, message) : null,
    expires_at: v.expiresAt.toISOString(),
    server_time: now.toISOString(),
    // A continuação web não autoriza login: o backend integrado confirma pela API/webhook.
    redirect_url: v.status === "verified" ? v.redirectUrl : null,
  };
}

/** Expira em lote as pendentes vencidas (worker). A leitura também expira sob demanda. */
export async function expireDueVerifications(limit = 200): Promise<number> {
  const now = new Date();
  const due = await prisma.verification.findMany({
    where: { status: "pending", expiresAt: { lte: now } },
    take: limit,
  });
  let n = 0;
  for (const v of due) {
    if (await prisma.$transaction((tx) => transition(tx, v, "expired", { now }))) n++;
  }
  return n;
}
