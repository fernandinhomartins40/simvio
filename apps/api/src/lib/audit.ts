import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db.js";

/** Quem age em operações compartilhadas entre o painel e o MCP. */
export interface Actor {
  type: "user" | "agent_key";
  id: string;
}

export interface AuditEntry {
  organizationId?: string | null;
  actorType: "user" | "superadmin" | "device" | "system" | "api_key" | "agent_key";
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  // Nunca incluir segredos, tokens, corpo de SMS ou telefone completo.
  metadata?: Prisma.InputJsonValue;
}

export async function audit(entry: AuditEntry, tx: Tx = prisma) {
  await tx.auditLog.create({
    data: {
      organizationId: entry.organizationId ?? null,
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata,
    },
  });
}
