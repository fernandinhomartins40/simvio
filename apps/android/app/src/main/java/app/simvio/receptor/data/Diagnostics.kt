package app.simvio.receptor.data

import android.Manifest
import android.app.ActivityManager
import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.PowerManager
import androidx.core.content.ContextCompat
import app.simvio.receptor.BuildConfig
import org.json.JSONObject

/** Estado local do aparelho, enviado no heartbeat. Somente estados — nunca conteúdo de SMS. */
data class DiagnosticsSnapshot(
    val smsPermission: Boolean,
    val batteryOptimizationIgnored: Boolean,
    val backgroundRestricted: Boolean,
    val network: String,
    val pendingEvents: Int,
    val lastSmsEventAt: Long,
    val lastDeliveryError: String?,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("receive_sms_permission", smsPermission)
        put("battery_optimization_ignored", batteryOptimizationIgnored)
        put("background_restricted", backgroundRestricted)
        put("network", network)
        put("pending_events", pendingEvents)
        put("last_sms_event_at", if (lastSmsEventAt > 0) java.time.Instant.ofEpochMilli(lastSmsEventAt).toString() else JSONObject.NULL)
        put("last_delivery_error", lastDeliveryError ?: JSONObject.NULL)
        put("manufacturer", Build.MANUFACTURER.take(80))
        put("model", Build.MODEL.take(80))
        put("android_version", Build.VERSION.RELEASE.take(20))
    }
}

object Diagnostics {
    fun hasSmsPermission(ctx: Context) =
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED

    fun network(ctx: Context): String {
        val cm = ctx.getSystemService(ConnectivityManager::class.java)
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return "none"
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
            else -> "other"
        }
    }

    fun snapshot(ctx: Context): DiagnosticsSnapshot {
        val store = SecureStore.get(ctx)
        val pm = ctx.getSystemService(PowerManager::class.java)
        val am = ctx.getSystemService(ActivityManager::class.java)
        return DiagnosticsSnapshot(
            smsPermission = hasSmsPermission(ctx),
            batteryOptimizationIgnored = pm.isIgnoringBatteryOptimizations(ctx.packageName),
            backgroundRestricted = Build.VERSION.SDK_INT >= 28 && am.isBackgroundRestricted,
            network = network(ctx),
            pendingEvents = store.pending().size,
            lastSmsEventAt = store.lastSmsEventAt,
            lastDeliveryError = store.lastDeliveryError,
        )
    }

    val appVersion: String get() = BuildConfig.VERSION_NAME
}
