package app.simvio.receptor.data

import android.content.Context
import app.simvio.receptor.sms.SmsParser
import app.simvio.receptor.work.Work
import java.io.IOException

/** Resultado de uma rodada de envio da fila. */
enum class DrainResult { DONE, RETRY_LATER, REVOKED, NOT_PAIRED }

/**
 * Envia a fila de eventos à API. Cada evento só sai da fila após resposta 2xx do servidor
 * (que deduplica pelo event_id) ou ao expirar. Falha de rede mantém o evento para nova tentativa.
 */
object EventSender {
    private val lock = Any()

    fun drain(ctx: Context): DrainResult = synchronized(lock) {
        val store = SecureStore.get(ctx)
        val base = store.apiBase
        val cred = store.credential
        if (base == null || cred == null) return DrainResult.NOT_PAIRED
        val api = ApiClient(base, cred)
        var retry = false
        for (event in store.pending()) {
            try {
                val res = api.sendEvent(event)
                store.remove(event.eventId)
                store.lastDeliveryError = null
                store.lastContactAt = System.currentTimeMillis()
                store.addActivity(activityKind(res.optString("outcome")), describe(res.optString("outcome"), event))
            } catch (e: RevokedException) {
                handleRevoked(ctx)
                return DrainResult.REVOKED
            } catch (e: ApiException) {
                // 4xx diferente de limite: o servidor recusou o formato; não adianta repetir.
                if (e.status in 400..499 && e.status != 429 && e.status != 408) {
                    store.remove(event.eventId)
                    store.addActivity("error", "Recusado pela Simvio: ${e.message}")
                } else {
                    store.markAttempt(event.eventId)
                    store.lastDeliveryError = "HTTP ${e.status}"
                    retry = true
                }
            } catch (e: IOException) {
                store.markAttempt(event.eventId)
                store.lastDeliveryError = "Sem conexão"
                if (event.attempts == 0) store.addActivity("waiting", "Aguardando internet · fila temporária")
                retry = true
            }
        }
        return if (retry) DrainResult.RETRY_LATER else DrainResult.DONE
    }

    /** Revogação recebida: apaga credencial e dados locais e encerra o envio autenticado. */
    fun handleRevoked(ctx: Context, byServer: Boolean = true) {
        val store = SecureStore.get(ctx)
        store.wipe()
        if (byServer) store.revokedNotice = true
        Work.cancelAll(ctx)
    }

    private fun activityKind(outcome: String) = when (outcome) {
        "verified", "line_verified" -> "delivered"
        else -> "rejected"
    }

    private fun describe(outcome: String, e: PendingEvent): String {
        val who = SmsParser.maskSender(e.sender)
        return when (outcome) {
            "verified" -> "Número confirmado · $who"
            "line_verified" -> "Linha validada · SMS de teste de $who"
            "rejected_sender" -> "Remetente diferente do esperado · $who"
            "rejected_expired" -> "Mensagem chegou após o prazo · $who"
            "rejected_receiver_sim" -> "Recebido em outro chip deste aparelho · $who"
            "rejected_line_conflict" -> "Este número já está ativo em outro aparelho"
            else -> "Código não reconhecido ou já usado · $who"
        }
    }
}
