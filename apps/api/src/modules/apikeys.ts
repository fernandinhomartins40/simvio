import type { Environment } from "@prisma/client";
import { prisma } from "../db.js";
import { audit } from "../lib/audit.js";
import { randomToken, sha256 } from "../lib/crypto.js";
import { notFound, unauthorized } from "../lib/errors.js";
import type { AppScope } from "./verifications/service.js";

/** Gera chave secreta de servidor: sk_test_… ou sk_live_…, exibida uma única vez. */
export async function createApiKey(
  organizationId: string,
  applicationId: string,
  environment: Environment,
  name: string,
  actorId: string | null,
  actorType: "user" | "agent_key" = "user",
) {
  const app = await prisma.application.findFirst({ where: { id: applicationId, organizationId, archivedAt: null } });
  if (!app) throw notFound("Aplicação");
  const secret = `sk_${environment}_${randomToken(32)}`;
  const key = await prisma.apiKey.create({
    data: {
      organizationId,
      applicationId,
      environment,
      name: name.slice(0, 80) || "Chave",
      prefix: secret.slice(0, 14),
      digest: sha256(secret),
      createdById: actorId,
    },
  });
  await audit({
    organizationId,
    actorType: actorId ? actorType : "system",
    actorId,
    action: "api_key.created",
    targetType: "api_key",
    targetId: key.id,
    metadata: { environment, prefix: key.prefix, application_id: applicationId },
  });
  return { key, secret };
}

export async function revokeApiKey(organizationId: string, keyId: string, actorId: string, actorType: "user" | "agent_key" = "user") {
  const key = await prisma.apiKey.findFirst({ where: { id: keyId, organizationId } });
  if (!key) throw notFound("Chave");
  if (!key.revokedAt) {
    await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    await audit({ organizationId, actorType, actorId, action: "api_key.revoked", targetType: "api_key", targetId: key.id, metadata: { prefix: key.prefix } });
  }
}

/** Autentica o backend integrado. A chave determina organização, aplicação e ambiente. */
export async function authenticateApiKey(authorization: string | undefined): Promise<AppScope> {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const m = /^sk_(test|live)_[A-Za-z0-9_-]{43}$/.exec(token);
  if (!m) throw unauthorized("Chave de API ausente ou inválida.");
  const key = await prisma.apiKey.findUnique({
    where: { digest: sha256(token) },
    include: { application: { select: { archivedAt: true } } },
  });
  if (!key || key.revokedAt || key.application.archivedAt || key.environment !== m[1]) {
    throw unauthorized("Chave de API ausente ou inválida.");
  }
  // Atualização de "último uso" com granularidade de 1 min para não gerar escrita a cada chamada.
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
    await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  }
  return { organizationId: key.organizationId, applicationId: key.applicationId, environment: key.environment };
}
