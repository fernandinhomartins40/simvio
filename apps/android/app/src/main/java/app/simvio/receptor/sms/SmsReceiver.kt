package app.simvio.receptor.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.telephony.SubscriptionManager
import app.simvio.receptor.data.EventSender
import app.simvio.receptor.data.PendingEvent
import app.simvio.receptor.data.SecureStore
import app.simvio.receptor.work.Work
import java.util.concurrent.Executors

/**
 * Recebe novos SMS (SMS_RECEIVED). Não lê histórico. Mensagens fora do formato Simvio são
 * ignoradas aqui mesmo — não são persistidas nem transmitidas.
 */
class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val store = SecureStore.get(context)
        if (!store.isPaired) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        val parts = messages.mapNotNull { m ->
            val sender = m.originatingAddress ?: m.displayOriginatingAddress ?: return@mapNotNull null
            SmsPart(sender, m.messageBody ?: "", m.timestampMillis)
        }
        val simvio = SmsParser.parse(parts)
        if (simvio.isEmpty()) return

        // Assinatura (SIM) que recebeu: usada pelo servidor para falhar de forma segura em dual SIM.
        val subId = intent.getIntExtra(SubscriptionManager.EXTRA_SUBSCRIPTION_INDEX, intent.getIntExtra("subscription", -1)).takeIf { it >= 0 }
        val now = System.currentTimeMillis()
        for (sms in simvio) {
            store.enqueue(
                PendingEvent(
                    eventId = SmsParser.eventId(sms, subId),
                    sender = sms.sender,
                    token = sms.token,
                    receivedAtMillis = sms.timestampMillis,
                    subscriptionId = subId,
                    queuedAtMillis = now,
                ),
            )
            store.addActivity("received", "SMS de verificação recebido · ${SmsParser.maskSender(sms.sender)}")
        }
        store.lastSmsEventAt = now

        // Tentativa imediata (orientada a evento). Se falhar, o WorkManager repete com backoff
        // quando houver rede — sem garantia de execução em segundos (limites do Android).
        val pending = goAsync()
        executor.execute {
            try {
                if (EventSender.drain(context) == app.simvio.receptor.data.DrainResult.RETRY_LATER) {
                    Work.enqueueDelivery(context)
                }
            } catch (t: Throwable) {
                Work.enqueueDelivery(context)
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        private val executor = Executors.newSingleThreadExecutor()
    }
}
