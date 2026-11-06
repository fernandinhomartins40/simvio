package app.simvio.receptor.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.text.format.DateUtils
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.ListAlt
import androidx.compose.material.icons.filled.Message
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Sms
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.simvio.receptor.data.Diagnostics
import app.simvio.receptor.ui.theme.Alerta
import app.simvio.receptor.ui.theme.Branco
import app.simvio.receptor.ui.theme.Erro
import app.simvio.receptor.ui.theme.Lima
import app.simvio.receptor.ui.theme.Mineral
import app.simvio.receptor.ui.theme.Petroleo
import app.simvio.receptor.ui.theme.PetroleoSuave
import app.simvio.receptor.ui.theme.Sucesso
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning

@Composable
internal fun ScreenColumn(content: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxSize().background(Mineral).verticalScroll(rememberScrollState()).padding(horizontal = 22.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        SimvioLogo()
        content()
        Spacer(Modifier.height(24.dp))
    }
}

private fun copy(ctx: Context, label: String, text: String) {
    ctx.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText(label, text))
}

// ---------------------------------------------------------------------------- Pareamento

@Composable
fun PairScreen(vm: MainViewModel) {
    val ctx = LocalContext.current
    ScreenColumn {
        BigTitle("Conecte este Android")
        Lead("No painel da Simvio, abra Aparelhos › Conectar aparelho. Depois leia o QR ou digite o código mostrado.")
        PrimaryButton("Ler QR do painel", onClick = {
            val options = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
            GmsBarcodeScanning.getClient(ctx, options).startScan()
                .addOnSuccessListener { code -> code.rawValue?.let { vm.applyPairingLink(Uri.parse(it)) } }
                .addOnFailureListener { vm.error = "Não foi possível abrir o leitor de QR. Digite o código abaixo." }
        })
        SimvioCard {
            Text("Ou digite os dados", style = MaterialTheme.typography.titleMedium, color = Petroleo)
            OutlinedTextField(
                value = vm.pairApi,
                onValueChange = { vm.pairApi = it },
                label = { Text("Endereço da API") },
                supportingText = { Text("Ex.: https://seu-dominio/api") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next),
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = vm.pairCode,
                onValueChange = { vm.pairCode = it.uppercase().take(16) },
                label = { Text("Código de pareamento") },
                supportingText = { Text("Vale por 5 minutos e só pode ser usado uma vez") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, imeAction = ImeAction.Done),
                modifier = Modifier.fillMaxWidth(),
            )
            val host = runCatching { Uri.parse(vm.pairApi).host }.getOrNull()
            if (!host.isNullOrBlank()) Text("Você vai conectar a: $host", color = PetroleoSuave, style = MaterialTheme.typography.bodyMedium)
            ErrorText(vm.error)
            PrimaryButton("Conectar", onClick = { vm.pair() }, enabled = vm.pairCode.length >= 8, loading = vm.busy)
        }
    }
}

// ---------------------------------------------------------------------------- Permissões

@Composable
fun PermissionScreen(onRequest: () -> Unit, permanentlyDenied: Boolean) {
    val ctx = LocalContext.current
    ScreenColumn {
        BigTitle("Permita receber SMS")
        Lead("Este Android precisa receber as mensagens que seus clientes enviam para confirmar o número.")
        SimvioCard {
            CheckRow("Só mensagens SIMVIO", "Mensagens que não começam com SIMVIO são ignoradas e não saem do aparelho.", CheckState.OK)
            CheckRow("Sem ler o histórico", "Apenas novas mensagens são verificadas.", CheckState.OK)
            CheckRow("Sem enviar SMS", "A Simvio não envia mensagens deste chip.", CheckState.OK)
        }
        if (permanentlyDenied) {
            Lead("A permissão foi negada. Abra as configurações do app e ative \"SMS\".")
            PrimaryButton("Abrir configurações", onClick = {
                ctx.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", ctx.packageName, null)))
            })
        } else {
            PrimaryButton("Permitir", onClick = onRequest)
            SecondaryButton("Usar como app de SMS padrão", onClick = { ctx.startActivity(Intent(ctx, MessagesActivity::class.java)) })
        }
    }
}

// ---------------------------------------------------------------------------- Linha receptora

@Composable
fun LineScreen(vm: MainViewModel) {
    val check = vm.lineCheck
    if (vm.justValidated) return LineReadyScreen { vm.justValidated = false }
    if (check == null || vm.line?.status == "editing") return LineNumberScreen(vm)
    LineTestScreen(vm, check)
}

@Composable
private fun LineNumberScreen(vm: MainViewModel) {
    var phone by rememberSaveable { mutableStateOf("") }
    ScreenColumn {
        BigTitle("Qual é o número deste chip")
        Lead("Digite o número do chip que está neste Android, com DDD. Em seguida vamos testar o recebimento.")
        SimvioCard {
            OutlinedTextField(
                value = phone,
                onValueChange = { phone = it.filter { c -> c.isDigit() || c in "+()- " }.take(20) },
                label = { Text("Número deste chip") },
                placeholder = { Text("(11) 98765-4321") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone, imeAction = ImeAction.Done),
                modifier = Modifier.fillMaxWidth(),
            )
            Text("Use um aparelho com apenas um chip ativo. Com dois chips, use o mesmo chip sempre.", color = PetroleoSuave, style = MaterialTheme.typography.bodyMedium)
            ErrorText(vm.error)
            PrimaryButton("Continuar", onClick = { vm.registerLine(phone) }, enabled = phone.count { it.isDigit() } >= 10, loading = vm.busy)
        }
    }
}

@Composable
private fun LineTestScreen(vm: MainViewModel, check: LineCheck) {
    val ctx = LocalContext.current
    ScreenColumn {
        BigTitle("Vamos testar o recebimento")
        Lead("Envie um SMS do seu próprio celular para o número abaixo, com a mensagem exata. Usamos esse SMS só para confirmar que este chip recebe.")
        SimvioCard {
            Text("Envie um SMS para", color = PetroleoSuave)
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconBadge(Icons.Filled.Sms)
                Spacer(Modifier.width(12.dp))
                Text(check.display, style = MaterialTheme.typography.headlineSmall, color = Petroleo, modifier = Modifier.weight(1f))
            }
            Text("Mensagem", color = PetroleoSuave)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(check.message, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, color = Petroleo, modifier = Modifier.weight(1f))
                IconButton(onClick = { copy(ctx, "Mensagem", check.message) }) { Icon(Icons.Filled.ContentCopy, contentDescription = "Copiar mensagem") }
            }
            HorizontalDivider()
            Row(verticalAlignment = Alignment.CenterVertically) {
                QrCode(check.smsUri, "QR para abrir o aplicativo de mensagens com número e texto preenchidos", Modifier.size(132.dp))
                Spacer(Modifier.width(14.dp))
                Column {
                    Text("Ou escaneie o QR", style = MaterialTheme.typography.titleMedium, color = Petroleo)
                    Text("Use a câmera do seu celular. O app de mensagens abre com número e texto preenchidos.", color = PetroleoSuave, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        if (vm.lineCheckExpired) SimvioCard {
            CheckRow("O tempo do teste acabou", "Mensagens enviadas agora não serão aceitas. Gere um novo teste e envie a nova mensagem.", CheckState.WARN)
            PrimaryButton("Gerar novo teste", onClick = { vm.line?.phone?.let(vm::registerLine) }, loading = vm.busy)
        } else SimvioCard {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(32.dp), color = Sucesso, trackColor = Lima.copy(alpha = 0.4f))
                Spacer(Modifier.width(14.dp))
                Column {
                    Text("Aguardando mensagem de teste…", style = MaterialTheme.typography.titleMedium, color = Petroleo)
                    Text("Isso pode levar alguns segundos. Mantenha este app aberto.", color = PetroleoSuave, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        ErrorText(vm.error)
        SecondaryButton("Corrigir o número", onClick = { vm.changeLine() })
    }
}

@Composable
private fun LineReadyScreen(onDone: () -> Unit) {
    ScreenColumn {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Box(Modifier.size(120.dp).background(Lima.copy(alpha = 0.45f), CircleShape), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Check, contentDescription = null, tint = Petroleo, modifier = Modifier.size(64.dp))
            }
        }
        BigTitle("Linha pronta")
        Lead("O SMS de teste foi recebido. Seu Android já está conectado e pronto para uso.")
        SimvioCard {
            CheckRow("SMS recebido", "Mensagem de teste detectada", CheckState.OK)
            CheckRow("Conexão com a Simvio", "A API confirmou o recebimento", CheckState.OK)
            CheckRow("Linha validada", "Pronto para verificar números", CheckState.OK)
        }
        PrimaryButton("Ir para o início", onClick = onDone)
    }
}

// ---------------------------------------------------------------------------- Início / Atividade / Ajustes

@Composable
fun HomeScreen(vm: MainViewModel, onOpenBattery: () -> Unit) {
    var tab by rememberSaveable { mutableStateOf(0) }
    Scaffold(
        containerColor = Mineral,
        bottomBar = {
            NavigationBar(containerColor = Branco) {
                listOf(Triple("Início", Icons.Filled.Home, 0), Triple("Atividade", Icons.Filled.ListAlt, 1), Triple("Ajustes", Icons.Filled.Settings, 2)).forEach { (label, icon, i) ->
                    NavigationBarItem(
                        selected = tab == i,
                        onClick = { tab = i; vm.refreshLocal() },
                        icon = { Icon(icon, contentDescription = null) },
                        label = { Text(label) },
                        colors = NavigationBarItemDefaults.colors(selectedIconColor = Petroleo, selectedTextColor = Petroleo, indicatorColor = Lima),
                    )
                }
            }
        },
    ) { pad ->
        Box(Modifier.padding(pad)) {
            when (tab) {
                0 -> StatusTab(vm, onOpenBattery)
                1 -> ActivityTab(vm)
                else -> SettingsTab(vm, onOpenBattery)
            }
        }
    }
}

private fun ago(millis: Long): String =
    if (millis <= 0) "nunca" else DateUtils.getRelativeTimeSpanString(millis, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS).toString()

@Composable
private fun StatusTab(vm: MainViewModel, onOpenBattery: () -> Unit) {
    val d = vm.diagnostics
    val healthy = vm.isHealthy()
    val recent = System.currentTimeMillis() - vm.lastContactAt < 20 * 60_000
    ScreenColumn {
        BigTitle(if (healthy) "Seu Android conectado" else "Precisa de atenção")
        Lead(if (healthy) "Recebendo mensagens SMS de verificação para suas aplicações." else "Resolva o item marcado abaixo para voltar a receber verificações.")
        StatusPill(if (recent) "Comunicação com a Simvio ${ago(vm.lastContactAt)}" else "Sem comunicação recente", recent)
        SimvioCard {
            Text("Recebendo SMS em", color = PetroleoSuave)
            Text(vm.line?.display ?: "—", style = MaterialTheme.typography.headlineSmall, color = Petroleo)
            PrimaryButton("Atualizar agora", onClick = { vm.sync() }, loading = vm.busy)
            ErrorText(vm.error)
        }
        SimvioCard {
            CheckRow("Internet", if (d.network == "none") "Sem conexão — os SMS ficam na fila" else "Conectado (${d.network})", if (d.network == "none") CheckState.ERROR else CheckState.OK)
            CheckRow("Permissão de SMS", if (d.smsPermission) "Concedida" else "Negada — não é possível receber", if (d.smsPermission) CheckState.OK else CheckState.ERROR)
            CheckRow("Linha validada", if (vm.line?.status == "active") "Teste de recebimento concluído" else "Faça o teste de recebimento", if (vm.line?.status == "active") CheckState.OK else CheckState.ERROR)
            CheckRow("Fila de envio", if (d.pendingEvents == 0) "Nada pendente" else "${d.pendingEvents} mensagem(ns) aguardando envio", if (d.pendingEvents == 0) CheckState.OK else CheckState.WARN)
            CheckRow(
                "Bateria",
                when {
                    d.backgroundRestricted -> "Uso em segundo plano restrito — toque em Ajustes para liberar"
                    d.batteryOptimizationIgnored -> "Sem restrição de bateria para este app"
                    else -> "Otimização ativa: alguns aparelhos atrasam o envio"
                },
                if (d.backgroundRestricted) CheckState.ERROR else if (d.batteryOptimizationIgnored) CheckState.OK else CheckState.WARN,
            )
        }
        if (!d.batteryOptimizationIgnored || d.backgroundRestricted) SecondaryButton("Ver ajustes de bateria", onClick = onOpenBattery)
        if (vm.defaultSms) {
            val ctx = LocalContext.current
            SecondaryButton("Abrir mensagens", onClick = { ctx.startActivity(Intent(ctx, MessagesActivity::class.java)) })
        }
        Text(
            "\"Comunicação recente\" mostra que o app falou com a Simvio. Para confirmar o recebimento de SMS, faça uma verificação de teste pelo painel.",
            color = PetroleoSuave, style = MaterialTheme.typography.bodyMedium,
        )
    }
}

@Composable
private fun ActivityTab(vm: MainViewModel) {
    ScreenColumn {
        BigTitle("Atividade")
        Lead("Mensagens de verificação recebidas neste aparelho. Outras mensagens não aparecem aqui.")
        if (vm.activity.isEmpty()) {
            SimvioCard { Text("Nenhuma atividade ainda.", color = PetroleoSuave) }
        } else SimvioCard {
            vm.activity.forEachIndexed { i, a ->
                if (i > 0) HorizontalDivider()
                val (icon, tint, title) = when (a.kind) {
                    "received" -> Triple(Icons.Filled.Message, Sucesso, "Recebido")
                    "delivered" -> Triple(Icons.Filled.ArrowForward, Petroleo, "Encaminhado")
                    "waiting" -> Triple(Icons.Filled.WifiOff, Alerta, "Aguardando internet")
                    "rejected" -> Triple(Icons.Filled.Schedule, Alerta, "Não aprovado")
                    else -> Triple(Icons.Filled.ErrorOutline, Erro, "Erro no envio")
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(icon, contentDescription = null, tint = tint)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(title, style = MaterialTheme.typography.titleMedium, color = tint)
                        Text(a.detail, style = MaterialTheme.typography.bodyMedium, color = PetroleoSuave)
                    }
                    Text(DateUtils.formatDateTime(null, a.atMillis, DateUtils.FORMAT_SHOW_TIME), color = PetroleoSuave, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

@Composable
private fun SettingsTab(vm: MainViewModel, onOpenBattery: () -> Unit) {
    var confirmUnpair by remember { mutableStateOf(false) }
    var confirmChange by remember { mutableStateOf(false) }
    val ctx = LocalContext.current
    ScreenColumn {
        BigTitle("Ajustes")
        SimvioCard {
            Info("Servidor", vm.apiHost ?: "—")
            Info("Linha", vm.line?.display ?: "—")
            Info("App de SMS padrão", if (vm.defaultSms) "Simvio" else "Outro app")
            Info("Versão do app", Diagnostics.appVersion)
            Info("Identificador", vm.deviceId?.takeLast(8) ?: "—")
        }
        SecondaryButton(if (vm.defaultSms) "Abrir mensagens" else "Usar como app de SMS padrão", onClick = { ctx.startActivity(Intent(ctx, MessagesActivity::class.java)) })
        if (vm.defaultSms) SecondaryButton("Trocar o app de SMS padrão", onClick = { ctx.startActivity(Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS)) })
        SecondaryButton("Ajustes de bateria do Android", onClick = onOpenBattery)
        SecondaryButton("Trocar número/chip", onClick = { confirmChange = true })
        TextButton(onClick = { confirmUnpair = true }, modifier = Modifier.fillMaxWidth()) {
            Text("Desconectar este aparelho", color = Erro, style = MaterialTheme.typography.titleMedium)
        }
    }
    if (confirmChange) AlertDialog(
        onDismissRequest = { confirmChange = false },
        title = { Text("Trocar número?") },
        text = { Text("Verificações em andamento neste aparelho serão encerradas. O aparelho só volta a receber após um novo teste de recebimento.") },
        confirmButton = { TextButton(onClick = { confirmChange = false; vm.changeLine() }) { Text("Trocar") } },
        dismissButton = { TextButton(onClick = { confirmChange = false }) { Text("Cancelar") } },
    )
    if (confirmUnpair) AlertDialog(
        onDismissRequest = { confirmUnpair = false },
        title = { Text("Desconectar aparelho?") },
        text = { Text("A credencial deste aparelho será revogada e os dados locais apagados. Verificações pendentes neste aparelho falharão.") },
        confirmButton = { TextButton(onClick = { confirmUnpair = false; vm.unpair() }) { Text("Desconectar", color = Erro) } },
        dismissButton = { TextButton(onClick = { confirmUnpair = false }) { Text("Cancelar") } },
    )
}

@Composable
private fun Info(label: String, value: String) {
    Row(Modifier.fillMaxWidth()) {
        Text(label, color = PetroleoSuave, modifier = Modifier.weight(1f))
        Text(value, color = Petroleo, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun RevokedScreen(onOk: () -> Unit) {
    ScreenColumn {
        BigTitle("Aparelho desconectado")
        Lead("A conexão deste aparelho foi encerrada pela Simvio ou pelo painel. A credencial e os dados locais foram apagados. Para usar de novo, conecte o aparelho outra vez.")
        PrimaryButton("Entendi", onClick = onOk)
    }
}

@Suppress("unused")
private val shape = RoundedCornerShape(16.dp)
