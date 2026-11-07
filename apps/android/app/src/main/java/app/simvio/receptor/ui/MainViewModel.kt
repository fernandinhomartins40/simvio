package app.simvio.receptor.ui

import android.app.Application
import android.net.Uri
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.simvio.receptor.data.ActivityEntry
import app.simvio.receptor.data.ApiClient
import app.simvio.receptor.data.ApiException
import app.simvio.receptor.data.Diagnostics
import app.simvio.receptor.data.DiagnosticsSnapshot
import app.simvio.receptor.data.EventSender
import app.simvio.receptor.data.RevokedException
import app.simvio.receptor.data.SecureStore
import app.simvio.receptor.sms.SmsBox
import app.simvio.receptor.work.Work
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.time.Instant

data class LineInfo(
    val phone: String,
    val display: String,
    val status: String,
    val checkExpiresAt: String?,
)

data class LineCheck(val display: String, val message: String, val smsUri: String, val expiresAt: String)

class MainViewModel(app: Application) : AndroidViewModel(app) {
    private val store = SecureStore.get(app)

    var paired by mutableStateOf(store.isPaired); private set
    var line by mutableStateOf<LineInfo?>(null); private set
    var lineCheck by mutableStateOf<LineCheck?>(null); private set
    var justValidated by mutableStateOf(false)
    var diagnostics by mutableStateOf(Diagnostics.snapshot(app)); private set
    var activity by mutableStateOf<List<ActivityEntry>>(store.activity()); private set
    var lastContactAt by mutableStateOf(store.lastContactAt); private set
    var busy by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null)
    var revokedNotice by mutableStateOf(store.revokedNotice); private set
    var lineCheckExpired by mutableStateOf(false); private set
    var defaultSms by mutableStateOf(SmsBox.isDefault(app)); private set

    // Pré-preenchidos pelo QR / link simvio://pair
    var pairApi by mutableStateOf(store.apiBase ?: "https://simvio.com.br/api")
    var pairCode by mutableStateOf("")

    private var polling: Job? = null

    val apiHost: String? get() = store.apiBase?.let { runCatching { Uri.parse(it).host }.getOrNull() }
    val deviceId: String? get() = store.deviceId

    fun applyPairingLink(uri: Uri?) {
        if (uri == null || uri.scheme != "simvio" || uri.host != "pair") return
        uri.getQueryParameter("api")?.let { pairApi = it }
        uri.getQueryParameter("code")?.let { pairCode = it }
    }

    fun refreshLocal() {
        diagnostics = Diagnostics.snapshot(getApplication())
        activity = store.activity()
        lastContactAt = store.lastContactAt
        paired = store.isPaired
        revokedNotice = store.revokedNotice
        defaultSms = SmsBox.isDefault(getApplication())
    }

    fun dismissRevoked() {
        store.revokedNotice = false
        revokedNotice = false
    }

    private fun api() = ApiClient(store.apiBase!!, store.credential)

    private fun launchIo(block: suspend () -> Unit) = viewModelScope.launch {
        busy = true
        error = null
        try {
            withContext(Dispatchers.IO) { block() }
        } catch (e: RevokedException) {
            EventSender.handleRevoked(getApplication())
        } catch (e: ApiException) {
            error = e.message
        } catch (e: IOException) {
            error = "Não foi possível falar com a Simvio. Verifique a internet e o endereço."
        } catch (e: Exception) {
            error = e.message ?: "Algo deu errado."
        } finally {
            busy = false
            refreshLocal()
        }
    }

    fun pair() = launchIo {
        val base = pairApi.trim().trimEnd('/')
        require(base.startsWith("https://") || base.startsWith("http://")) { "Endereço inválido. Use o link do painel." }
        val info = JSONObject()
            .put("name", "${Build.MANUFACTURER} ${Build.MODEL}".take(80))
            .put("manufacturer", Build.MANUFACTURER)
            .put("model", Build.MODEL)
            .put("android_version", Build.VERSION.RELEASE)
            .put("app_version", Diagnostics.appVersion)
        val res = ApiClient(base).pair(pairCode.trim(), info)
        store.apiBase = base
        store.credential = res.getString("device_credential")
        store.deviceId = res.getString("device_id")
        store.lastContactAt = System.currentTimeMillis()
        store.addActivity("delivered", "Aparelho conectado à Simvio")
        Work.scheduleHeartbeat(getApplication())
        withContext(Dispatchers.Main) { paired = true }
        loadState()
    }

    /** Envia diagnóstico e lê o estado da linha. */
    fun sync() = launchIo { loadState() }

    private suspend fun loadState() {
        EventSender.drain(getApplication())
        val res = api().heartbeat(Diagnostics.appVersion, Diagnostics.snapshot(getApplication()).toJson())
        store.lastContactAt = System.currentTimeMillis()
        val l = res.optJSONObject("line")
        val info = l?.let {
            LineInfo(it.getString("phone_number"), it.getString("phone_display"), it.getString("status"), it.optString("check_expires_at").ifEmpty { null })
        }
        withContext(Dispatchers.Main) {
            if (line?.status == "pending_check" && info?.status == "active") {
                justValidated = true
                lineCheck = null
            }
            line = info
        }
    }

    fun registerLine(phone: String) = launchIo {
        val res = api().registerLine(phone)
        withContext(Dispatchers.Main) {
            lineCheckExpired = false
            lineCheck = LineCheck(res.getString("phone_display"), res.getString("message_body"), res.getString("sms_uri"), res.getString("expires_at"))
        }
        loadState()
        startPollingLine()
    }

    /** Durante o teste da linha, consulta o servidor a cada 3s até a linha ficar ativa. */
    fun startPollingLine() {
        polling?.cancel()
        polling = viewModelScope.launch {
            while (isActive && line?.status != "active") {
                delay(3000)
                // O servidor recusa o SMS de teste após o prazo: parar de esperar e oferecer novo teste.
                if (lineCheck?.let { Instant.parse(it.expiresAt).toEpochMilli() < System.currentTimeMillis() } == true) {
                    lineCheckExpired = true
                    break
                }
                runCatching { withContext(Dispatchers.IO) { loadState() } }
                refreshLocal()
            }
        }
    }

    fun changeLine() {
        lineCheck = null
        line = line?.copy(status = "editing")
    }

    fun unpair() = launchIo {
        runCatching { api().unpair() }
        EventSender.handleRevoked(getApplication(), byServer = false)
        withContext(Dispatchers.Main) {
            paired = false
            line = null
            lineCheck = null
        }
    }

    fun isHealthy(d: DiagnosticsSnapshot = diagnostics) =
        paired && line?.status == "active" && defaultSms && d.smsPermission && d.network != "none" && d.pendingEvents == 0
}
