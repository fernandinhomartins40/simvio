import { randomUUID } from "node:crypto";
import type { Verification } from "@prisma/client";
import type { WebhookEventType } from "@simvio/contracts";
import type { Tx } from "../db.js";

/**
 * Registra o evento de saída na MESMA transação da mudança de estado (outbox transacional).
 * O worker entrega depois; se cair após o commit, o evento continua pendente no banco.
 */
export async function enqueueVerificationEvent(
  tx: Tx,
  type: WebhookEventType,
  v: Pick<Verification, "id" | "organizationId" | "applicationId" | "environment" | "reference" | "phoneMasked">,
  status: string,
  occurredAt: Date,
) {
  // O event_id do webhook é o id do outbox: estável em todas as tentativas e reentregas.
  const id = `evt_${randomUUID().replace(/-/g, "")}`;
  return tx.outboxEvent.create({
    data: {
      id,
      organizationId: v.organizationId,
      applicationId: v.applicationId,
      environment: v.environment,
      type,
      verificationId: v.id,
      payload: {
        event_id: id,
        type,
        verification_id: v.id,
        application_id: v.applicationId,
        environment: v.environment,
        reference: v.reference,
        status,
        phone_masked: v.phoneMasked,
        occurred_at: occurredAt.toISOString(),
      },
    },
  });
}
