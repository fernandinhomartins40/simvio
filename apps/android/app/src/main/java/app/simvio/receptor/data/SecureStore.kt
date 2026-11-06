package app.simvio.receptor.data

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** AES-256-GCM com chave não exportável no Android Keystore. */
private object KeystoreCipher {
    private const val ALIAS = "simvio_store_v1"

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return gen.generateKey()
    }

    fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val out = cipher.iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(out, Base64.NO_WRAP)
    }

    fun decrypt(payload: String): String {
        val bytes = Base64.decode(payload, Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, 12))
        return String(cipher.doFinal(bytes, 12, bytes.size - 12), Charsets.UTF_8)
    }

    fun deleteKey() {
        runCatching { KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(ALIAS) }
    }
}

data class PendingEvent(
    val eventId: String,
    val sender: String,
    val token: String,
    val receivedAtMillis: Long,
    val subscriptionId: Int?,
    val queuedAtMillis: Long,
    val attempts: Int = 0,
)

data class ActivityEntry(val atMillis: Long, val kind: String, val detail: String)

/**
 * Armazenamento local cifrado: credencial do aparelho, fila mínima de eventos e atividade recente.
 * Tudo é apagado quando o pareamento é revogado ou desfeito.
 */
class SecureStore private constructor(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("simvio_secure", Context.MODE_PRIVATE)

    companion object {
        /** Eventos não confirmados expiram: a sessão dura 5 min e o teste de linha, 15 min. */
        const val EVENT_TTL_MILLIS = 30 * 60 * 1000L
        private const val MAX_ACTIVITY = 50

        @Volatile private var instance: SecureStore? = null
        fun get(context: Context): SecureStore =
            instance ?: synchronized(this) { instance ?: SecureStore(context.applicationContext).also { instance = it } }
    }

    private fun readSecret(key: String): String? =
        prefs.getString(key, null)?.let { runCatching { KeystoreCipher.decrypt(it) }.getOrNull() }

    private fun writeSecret(key: String, value: String?) {
        prefs.edit().apply { if (value == null) remove(key) else putString(key, KeystoreCipher.encrypt(value)) }.commit()
    }

    var apiBase: String?
        get() = prefs.getString("api_base", null)
        set(v) { prefs.edit().putString("api_base", v).commit() }

    var credential: String?
        get() = readSecret("credential")
        set(v) = writeSecret("credential", v)

    var deviceId: String?
        get() = prefs.getString("device_id", null)
        set(v) { prefs.edit().putString("device_id", v).commit() }

    var lastSmsEventAt: Long
        get() = prefs.getLong("last_sms_event_at", 0)
        set(v) { prefs.edit().putLong("last_sms_event_at", v).commit() }

    var lastDeliveryError: String?
        get() = prefs.getString("last_delivery_error", null)
        set(v) { prefs.edit().putString("last_delivery_error", v).commit() }

    var lastContactAt: Long
        get() = prefs.getLong("last_contact_at", 0)
        set(v) { prefs.edit().putLong("last_contact_at", v).commit() }

    /** Sobrevive ao wipe: avisa o operador que o pareamento foi encerrado pelo servidor. */
    var revokedNotice: Boolean
        get() = prefs.getBoolean("revoked_notice", false)
        set(v) { prefs.edit().putBoolean("revoked_notice", v).commit() }

    val isPaired: Boolean get() = credential != null && apiBase != null

    // ------------------------------------------------------------------ fila de eventos

    private val queueLock = Any()

    fun enqueue(event: PendingEvent) = synchronized(queueLock) {
        val list = pending().filterNot { it.eventId == event.eventId } + event
        savePending(list)
    }

    fun pending(): List<PendingEvent> = synchronized(queueLock) {
        val raw = readSecret("queue") ?: return emptyList()
        val now = System.currentTimeMillis()
        val arr = runCatching { JSONArray(raw) }.getOrElse { JSONArray() }
        (0 until arr.length()).map { arr.getJSONObject(it) }.map {
            PendingEvent(
                eventId = it.getString("id"),
                sender = it.getString("sender"),
                token = it.getString("token"),
                receivedAtMillis = it.getLong("received"),
                subscriptionId = if (it.has("sub")) it.getInt("sub") else null,
                queuedAtMillis = it.getLong("queued"),
                attempts = it.optInt("attempts"),
            )
        }.filter { now - it.queuedAtMillis < EVENT_TTL_MILLIS }
    }

    fun remove(eventId: String) = synchronized(queueLock) { savePending(pending().filterNot { it.eventId == eventId }) }

    fun markAttempt(eventId: String) = synchronized(queueLock) {
        savePending(pending().map { if (it.eventId == eventId) it.copy(attempts = it.attempts + 1) else it })
    }

    private fun savePending(list: List<PendingEvent>) {
        val arr = JSONArray()
        list.forEach { e ->
            arr.put(JSONObject().apply {
                put("id", e.eventId); put("sender", e.sender); put("token", e.token)
                put("received", e.receivedAtMillis); put("queued", e.queuedAtMillis); put("attempts", e.attempts)
                e.subscriptionId?.let { put("sub", it) }
            })
        }
        writeSecret("queue", if (list.isEmpty()) null else arr.toString())
    }

    // ------------------------------------------------------------------ atividade local (sem tokens)

    fun addActivity(kind: String, detail: String) = synchronized(queueLock) {
        val arr = JSONArray()
        arr.put(JSONObject().put("at", System.currentTimeMillis()).put("kind", kind).put("detail", detail))
        activity().take(MAX_ACTIVITY - 1).forEach {
            arr.put(JSONObject().put("at", it.atMillis).put("kind", it.kind).put("detail", it.detail))
        }
        prefs.edit().putString("activity", arr.toString()).commit()
    }

    fun activity(): List<ActivityEntry> {
        val arr = runCatching { JSONArray(prefs.getString("activity", "[]")) }.getOrElse { JSONArray() }
        return (0 until arr.length()).map { arr.getJSONObject(it) }
            .map { ActivityEntry(it.getLong("at"), it.getString("kind"), it.getString("detail")) }
    }

    /** Remove credencial, fila, atividade e a chave do Keystore. */
    fun wipe() = synchronized(queueLock) {
        prefs.edit().clear().commit()
        KeystoreCipher.deleteKey()
    }
}
