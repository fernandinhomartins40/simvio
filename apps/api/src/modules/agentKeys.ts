import { prisma } from "../db.js";
import { audit } from "../lib/audit.js";
import { randomToken, sha256 } from "../lib/crypto.js";
import { notFound, unauthorized } from "../lib/errors.js";

export const serializeAgentKey = (k: {
  id: string;
  name: string;
  prefix: string;
  allowLive: boolean;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}) => ({
  id: k.id,
  name: k.name,
  prefix: k.prefix,
  allow_live: k.allowLive,
  expires_at: k.expiresAt?.toISOString() ?? null,
  last_used_at: k.lastUsedAt?.toISOString() ?? null,
  revoked_at: k.revokedAt?.toISOString() ?? null,
  created_at: k.createdAt.toISOString(),
});

/** Gera a chave do agente de IA: smv_agent_…, exibida uma única vez. */
export async function createAgentKey(organizationId: string, name: string, allowLive: boolean, expiresInDays: number | null, actorId: string) {
  const secret = `smv_agent_${randomToken(32)}`;
  const key = await prisma.agentKey.create({
    data: {
      organizationId,
      name,
      prefix: secret.slice(0, 16),
      digest: sha256(secret),
      allowLive,
      createdById: actorId,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 3600 * 1000) : null,
    },
  });
  await audit({ organizationId, actorType: "user", actorId, action: "agent_key.created", targetType: "agent_key", targetId: key.id, metadata: { prefix: key.prefix, allow_live: allowLive } });
  return { key, secret };
}

export async function revokeAgentKey(organizationId: string, keyId: string, actorId: string) {
  const key = await prisma.agentKey.findFirst({ where: { id: keyId, organizationId } });
  if (!key) throw notFound("Chave de agente");
  if (!key.revokedAt) {
    await prisma.agentKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    await audit({ organizationId, actorType: "user", actorId, action: "agent_key.revoked", targetType: "agent_key", targetId: key.id, metadata: { prefix: key.prefix } });
  }
}

/** A chave determina a organização; nenhuma ferramenta recebe organização como parâmetro. */
export async function authenticateAgentKey(authorization: string | undefined) {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const message = "Chave de agente ausente ou inválida.";
  if (!/^smv_agent_[A-Za-z0-9_-]{43}$/.test(token)) throw unauthorized(message);
  const key = await prisma.agentKey.findUnique({ where: { digest: sha256(token) } });
  if (!key || key.revokedAt || (key.expiresAt && key.expiresAt <= new Date())) throw unauthorized(message);
  // Granularidade de 1 min para não gerar escrita a cada chamada.
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
    await prisma.agentKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  }
  return { id: key.id, organizationId: key.organizationId, allowLive: key.allowLive };
}
