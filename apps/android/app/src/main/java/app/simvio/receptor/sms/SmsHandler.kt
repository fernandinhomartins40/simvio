package app.simvio.receptor.sms

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Telephony
import android.telephony.SubscriptionManager
import app.simvio.receptor.data.SecureStore
import app.simvio.receptor.ui.MessagesActivity
import java.util.concurrent.Executors

/**
 * Entrega exclusiva ao app padrão (SMS_DELIVER): se não gravarmos aqui, a mensagem some do aparelho.
 * O encaminhamento das verificações continua só no SmsReceiver (SMS_RECEIVED), que o Android também entrega.
 */
class SmsDeliverReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_DELIVER_ACTION) return
        val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent)?.mapNotNull { m ->
            val sender = m.originatingAddress ?: m.displayOriginatingAddress ?: return@mapNotNull null
            SmsPart(sender, m.messageBody ?: "", m.timestampMillis)
        } ?: return
        val subId = intent.getIntExtra(SubscriptionManager.EXTRA_SUBSCRIPTION_INDEX, intent.getIntExtra("subscription", -1)).takeIf { it >= 0 }
        // Fora da linha principal: travar aqui em aparelho lento faria o Android matar o app antes de gravar.
        val pending = goAsync()
        executor.execute {
            try {
                for (sms in SmsParser.toStore(parts, SecureStore.get(context).isPaired)) {
                    SmsBox.saveIncoming(context, sms, subId)
                    notifyNew(context, sms)
                }
            } finally {
                pending.finish()
            }
        }
    }

    private fun notifyNew(ctx: Context, sms: SmsPart) {
        val manager = ctx.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Mensagens", NotificationManager.IMPORTANCE_HIGH))
        val open = Intent(Intent.ACTION_SENDTO, Uri.fromParts("smsto", sms.sender, null)).setClass(ctx, MessagesActivity::class.java)
        val tap = PendingIntent.getActivity(ctx, sms.sender.hashCode(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification = Notification.Builder(ctx, CHANNEL)
            .setSmallIcon(android.R.drawable.sym_action_chat)
            .setContentTitle(sms.sender)
            .setContentText(sms.body)
            .setStyle(Notification.BigTextStyle().bigText(sms.body))
            .setCategory(Notification.CATEGORY_MESSAGE)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setContentIntent(tap)
            .setAutoCancel(true)
            .build()
        manager.notify(sms.sender.hashCode(), notification)
    }

    private companion object {
        const val CHANNEL = "mensagens"
        val executor = Executors.newSingleThreadExecutor()
    }
}

/** Exigido para ser app padrão. shortcut: MMS não é baixado; implementar se o app sair do aparelho dedicado. */
class MmsPushReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) = Unit
}

class SmsSentReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val uri = intent.data ?: return
        if (resultCode == Activity.RESULT_OK) return
        context.contentResolver.update(uri, ContentValues().apply { put(Telephony.Sms.TYPE, Telephony.Sms.MESSAGE_TYPE_FAILED) }, null, null)
    }
}

/** Resposta rápida a uma chamada recusada. Só o sistema pode chamar (SEND_RESPOND_VIA_MESSAGE). */
class HeadlessSmsSendService : Service() {
    override fun onBind(intent: Intent?) = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val address = intent?.data?.let { SmsParser.parseSmsUri(it.schemeSpecificPart).first }
        val body = intent?.getStringExtra(Intent.EXTRA_TEXT)
        if (!address.isNullOrBlank() && !body.isNullOrBlank()) runCatching { SmsBox.send(this, address, body) }
        stopSelf(startId)
        return START_NOT_STICKY
    }
}
