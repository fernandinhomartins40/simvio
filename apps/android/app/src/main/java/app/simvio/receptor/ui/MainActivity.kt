package app.simvio.receptor.ui

import android.Manifest
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.simvio.receptor.ui.theme.SimvioTheme

class MainActivity : ComponentActivity() {
    private val vm: MainViewModel by viewModels()
    private var permanentlyDenied by mutableStateOf(false)

    private val requestPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { smsGranted ->
        permanentlyDenied = !smsGranted && !shouldShowRequestPermissionRationale(Manifest.permission.RECEIVE_SMS)
        vm.refreshLocal()
        if (smsGranted) vm.sync()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        vm.applyPairingLink(intent?.data)
        setContent {
            SimvioTheme {
                when {
                    vm.revokedNotice -> RevokedScreen { vm.dismissRevoked() }
                    !vm.paired -> PairScreen(vm)
                    !vm.diagnostics.smsPermission -> PermissionScreen(::askPermissions, permanentlyDenied)
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

    private fun askPermissions() {
        requestPermission.launch(Manifest.permission.RECEIVE_SMS)
    }

    /** Abre a lista de otimização de bateria do sistema; a decisão é do operador (não pedimos isenção direta). */
    private fun openBatterySettings() {
        runCatching { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
            .onFailure { startActivity(Intent(Settings.ACTION_SETTINGS)) }
    }
}
