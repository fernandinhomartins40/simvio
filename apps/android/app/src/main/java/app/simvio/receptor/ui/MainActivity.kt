package app.simvio.receptor.ui

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.simvio.receptor.sms.SmsBox
import app.simvio.receptor.ui.theme.SimvioTheme

class MainActivity : ComponentActivity() {
    private val vm: MainViewModel by viewModels()
    private var refused by mutableStateOf(false)

    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    // Política de SMS da Play Store: as permissões de SMS só vêm junto com o papel de app padrão.
    private val askDefault = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        vm.refreshLocal()
        refused = !vm.defaultSms
        if (vm.defaultSms) {
            if (Build.VERSION.SDK_INT >= 33) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
            vm.sync()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        vm.applyPairingLink(intent?.data)
        setContent {
            SimvioTheme {
                when {
                    vm.revokedNotice -> RevokedScreen { vm.dismissRevoked() }
                    !vm.paired -> PairScreen(vm)
                    !vm.defaultSms -> ActivationScreen(refused) { askDefault.launch(SmsBox.requestDefaultIntent(this)) }
                    vm.justValidated || vm.line?.status != "active" -> LineScreen(vm)
                    else -> HomeScreen(vm, ::openBatterySettings)
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        vm.applyPairingLink(intent.data)
    }

    override fun onResume() {
        super.onResume()
        vm.refreshLocal()
        if (vm.paired) {
            vm.sync()
            if (vm.line?.status == "pending_check" || vm.lineCheck != null) vm.startPollingLine()
        }
    }

    /** Abre a lista de otimização de bateria do sistema; a decisão é do operador (não pedimos isenção direta). */
    private fun openBatterySettings() {
        runCatching { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
            .onFailure { startActivity(Intent(Settings.ACTION_SETTINGS)) }
    }
}
