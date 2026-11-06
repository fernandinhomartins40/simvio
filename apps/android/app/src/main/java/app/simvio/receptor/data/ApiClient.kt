package app.simvio.receptor.data

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

class RevokedException : Exception("Pareamento revogado")
class ApiException(val status: Int, val code: String?, override val message: String) : Exception(message)

/**
 * Cliente HTTP mínimo (HttpURLConnection + org.json, sem dependências).
 * `apiBase` é a URL pública da API sem a versão, ex.: https://simvio.exemplo.com/api
 */
class ApiClient(private val apiBase: String, private val credential: String? = null) {

    fun pair(code: String, info: JSONObject): JSONObject =
        post("/v1/devices/pair", JSONObject(info.toString()).put("code", code), auth = false)

    fun heartbeat(appVersion: String, diagnostics: JSONObject): JSONObject =
        post("/v1/devices/heartbeat", JSONObject().put("app_version", appVersion).put("diagnostics", diagnostics))

    fun me(): JSONObject = request("GET", "/v1/devices/me", null, auth = true)

    fun registerLine(phone: String): JSONObject = post("/v1/devices/line", JSONObject().put("phone_number", phone))

    fun unpair(): JSONObject = post("/v1/devices/unpair", JSONObject())

    fun sendEvent(e: PendingEvent): JSONObject = post(
        "/v1/device-events",
        JSONObject().apply {
            put("event_id", e.eventId)
            put("sender", e.sender)
            put("token", e.token)
            put("received_at", java.time.Instant.ofEpochMilli(e.receivedAtMillis).toString())
            e.subscriptionId?.let { put("subscription_id", it) }
        },
    )

    private fun post(path: String, body: JSONObject, auth: Boolean = true) = request("POST", path, body, auth)

    private fun request(method: String, path: String, body: JSONObject?, auth: Boolean): JSONObject {
        val conn = (URL(apiBase.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 8_000
            readTimeout = 10_000
            instanceFollowRedirects = false
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", "SimvioReceptor/Android")
            if (auth) {
                val c = credential ?: throw IllegalStateException("Aparelho não pareado")
                setRequestProperty("Authorization", "Bearer $c")
            }
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
        }
        try {
            if (body != null) conn.outputStream.use { it.write(body.toString().toByteArray()) }
            val status = conn.responseCode
            val text = (if (status < 400) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            val json = runCatching { JSONObject(text) }.getOrElse { JSONObject() }
            if (status in 200..299) return json
            val err = json.optJSONObject("error")
            if (status == 401 && err?.optJSONObject("details")?.optBoolean("revoked") == true) throw RevokedException()
            throw ApiException(status, err?.optString("code"), err?.optString("message") ?: "Erro $status do servidor")
        } catch (e: IOException) {
            throw e
        } finally {
            conn.disconnect()
        }
    }
}
