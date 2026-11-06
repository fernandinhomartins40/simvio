package app.simvio.receptor.sms

import android.app.PendingIntent
import android.app.role.RoleManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Telephony
import android.telephony.SmsManager

data class SmsRow(
    val id: Long,
    val threadId: Long,
    val address: String,
    val body: String,
    val date: Long,
    val type: Int,
    val read: Boolean,
) {
    val outgoing get() = type != Telephony.Sms.MESSAGE_TYPE_INBOX
    val failed get() = type == Telephony.Sms.MESSAGE_TYPE_FAILED
}

data class SmsConversation(val last: SmsRow, val unread: Int)

/** Caixa de SMS do sistema. Só funciona como app padrão; o conteúdo fica no aparelho e nunca vai para a Simvio. */
object SmsBox {
    private val COLUMNS = arrayOf(
        Telephony.Sms._ID, Telephony.Sms.THREAD_ID, Telephony.Sms.ADDRESS,
        Telephony.Sms.BODY, Telephony.Sms.DATE, Telephony.Sms.TYPE, Telephony.Sms.READ,
    )

    fun isDefault(ctx: Context) =
        if (Build.VERSION.SDK_INT >= 29) {
            ctx.getSystemService(RoleManager::class.java).isRoleHeld(RoleManager.ROLE_SMS)
        } else {
            Telephony.Sms.getDefaultSmsPackage(ctx) == ctx.packageName
        }

    fun requestDefaultIntent(ctx: Context): Intent =
        if (Build.VERSION.SDK_INT >= 29) {
            ctx.getSystemService(RoleManager::class.java).createRequestRoleIntent(RoleManager.ROLE_SMS)
        } else {
            Intent(Telephony.Sms.Intents.ACTION_CHANGE_DEFAULT).putExtra(Telephony.Sms.Intents.EXTRA_PACKAGE_NAME, ctx.packageName)
        }

    private fun query(ctx: Context, where: String?, args: Array<String>?, limit: Int): List<SmsRow> {
        val rows = ArrayList<SmsRow>()
        ctx.contentResolver.query(Telephony.Sms.CONTENT_URI, COLUMNS, where, args, "${Telephony.Sms.DATE} DESC")?.use { c ->
            while (rows.size < limit && c.moveToNext()) {
                rows += SmsRow(c.getLong(0), c.getLong(1), c.getString(2) ?: "", c.getString(3) ?: "", c.getLong(4), c.getInt(5), c.getInt(6) == 1)
            }
        }
        return rows
    }

    // shortcut: olha só as 1000 mensagens mais recentes; paginar se um aparelho dedicado precisar de mais.
    fun conversations(ctx: Context): List<SmsConversation> =
        query(ctx, null, null, 1000).groupBy { it.threadId }.values.map { rows -> SmsConversation(rows.first(), rows.count { !it.read }) }

    /** Mensagens da conversa, da mais antiga para a mais nova, já marcadas como lidas. */
    fun thread(ctx: Context, address: String): List<SmsRow> {
        val threadId = Telephony.Threads.getOrCreateThreadId(ctx, address).toString()
        val read = ContentValues().apply { put(Telephony.Sms.READ, 1); put(Telephony.Sms.SEEN, 1) }
        ctx.contentResolver.update(Telephony.Sms.CONTENT_URI, read, "${Telephony.Sms.THREAD_ID}=? AND ${Telephony.Sms.READ}=0", arrayOf(threadId))
        return query(ctx, "${Telephony.Sms.THREAD_ID}=?", arrayOf(threadId), 300).reversed()
    }

    fun saveIncoming(ctx: Context, sms: SmsPart, subscriptionId: Int?) {
        val values = ContentValues().apply {
            put(Telephony.Sms.ADDRESS, sms.sender)
            put(Telephony.Sms.BODY, sms.body)
            put(Telephony.Sms.DATE, System.currentTimeMillis())
            put(Telephony.Sms.DATE_SENT, sms.timestampMillis)
            put(Telephony.Sms.READ, 0)
            put(Telephony.Sms.SEEN, 0)
            subscriptionId?.let { put(Telephony.Sms.SUBSCRIPTION_ID, it) }
        }
        ctx.contentResolver.insert(Telephony.Sms.Inbox.CONTENT_URI, values)
    }

    /** O app padrão grava o que envia: o Android não faz isso por ele. Falhas são marcadas pelo SmsSentReceiver. */
    @Suppress("DEPRECATION")
    fun send(ctx: Context, address: String, body: String) {
        val values = ContentValues().apply {
            put(Telephony.Sms.ADDRESS, address)
            put(Telephony.Sms.BODY, body)
            put(Telephony.Sms.DATE, System.currentTimeMillis())
            put(Telephony.Sms.READ, 1)
            put(Telephony.Sms.SEEN, 1)
        }
        val uri: Uri = requireNotNull(ctx.contentResolver.insert(Telephony.Sms.Sent.CONTENT_URI, values)) { "Não foi possível gravar a mensagem." }
        val sent = PendingIntent.getBroadcast(ctx, 0, Intent(ctx, SmsSentReceiver::class.java).setData(uri), PendingIntent.FLAG_IMMUTABLE)
        val manager = if (Build.VERSION.SDK_INT >= 31) ctx.getSystemService(SmsManager::class.java) else SmsManager.getDefault()
        val parts = manager.divideMessage(body)
        manager.sendMultipartTextMessage(address, null, parts, ArrayList(parts.map { sent }), null)
    }
}
