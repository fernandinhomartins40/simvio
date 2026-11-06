import { prisma } from "../db.js";

const DAY = 24 * 3600 * 1000;

/**
 * Retenção proposta no PRD §12 (decisão de produto, não prazo legal):
 * - telefone completo cifrado: 7 dias;
 * - histórico operacional mascarado (verificações, eventos do aparelho, entregas): 30 dias;
 * - auditoria sem segredos: 90 dias;
 * - registros transitórios (idempotência, pareamento, sessões, tokens de e-mail): após expirar.
 */
export async function purgeExpiredData(now = new Date()) {
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const results = await prisma.$transaction([
    prisma.verification.updateMany({ where: { createdAt: { lt: ago(7) }, phoneEnc: { not: null } }, data: { phoneEnc: null } }),
    prisma.verification.deleteMany({ where: { createdAt: { lt: ago(30) }, status: { not: "pending" } } }),
    prisma.deviceEvent.deleteMany({ where: { receivedAt: { lt: ago(30) } } }),
    prisma.outboxEvent.deleteMany({ where: { createdAt: { lt: ago(30) }, status: "done" } }),
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: ago(90) } } }),
    prisma.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.pairingSession.deleteMany({ where: { expiresAt: { lt: ago(1) } } }),
    prisma.webSession.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.emailToken.deleteMany({ where: { expiresAt: { lt: ago(1) } } }),
  ]);
  return results.reduce((n, r) => n + r.count, 0);
}
