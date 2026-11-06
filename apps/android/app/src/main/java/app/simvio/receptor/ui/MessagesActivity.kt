package app.simvio.receptor.ui

import android.Manifest
import android.content.Intent
import android.database.ContentObserver
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Telephony
import android.text.format.DateUtils
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.simvio.receptor.sms.SmsBox
import app.simvio.receptor.sms.SmsConversation
import app.simvio.receptor.sms.SmsParser
import app.simvio.receptor.sms.SmsRow
import app.simvio.receptor.ui.theme.Branco
import app.simvio.receptor.ui.theme.Erro
import app.simvio.receptor.ui.theme.Lima
import app.simvio.receptor.ui.theme.Mineral
import app.simvio.receptor.ui.theme.Petroleo
import app.simvio.receptor.ui.theme.PetroleoSuave
import app.simvio.receptor.ui.theme.SimvioTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private data class Open(val address: String, val draft: String)

/** Modo de app de SMS padrão: ativação, conversas e envio. Nada aqui passa pela API da Simvio. */
class MessagesActivity : ComponentActivity() {
    private var isDefault by mutableStateOf(false)
    private var refused by mutableStateOf(false)
    private var open by mutableStateOf<Open?>(null)

    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }
    private val askDefault = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        isDefault = SmsBox.isDefault(this)
        refused = !isDefault
        if (isDefault && Build.VERSION.SDK_INT >= 33) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        applyIntent(intent)
        setContent {
            SimvioTheme {
                Box(Modifier.fillMaxSize().background(Mineral).safeDrawingPadding()) {
                    val current = open
                    when {
                        !isDefault -> ActivationScreen(refused) { askDefault.launch(SmsBox.requestDefaultIntent(this@MessagesActivity)) }
                        current != null -> {
                            BackHandler { open = null }
                            ThreadScreen(current, onBack = { open = null }, onAddress = { open = current.copy(address = it, draft = "") })
                        }
                        else -> InboxScreen(onOpen = { open = Open(it, "") }, onNew = { open = Open("", "") }, onBack = ::finish)
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        applyIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        isDefault = SmsBox.isDefault(this)
    }

    /** Link sms:/smsto: só preenche a tela: enviar sempre depende do toque do operador. */
    private fun applyIntent(intent: Intent?) {
        val data = intent?.data ?: return
        val (address, body) = SmsParser.parseSmsUri(data.schemeSpecificPart)
        open = Open(address, intent.getStringExtra("sms_body") ?: intent.getStringExtra(Intent.EXTRA_TEXT) ?: body)
    }
}

/** Muda de valor sempre que a caixa de SMS muda (mensagem recebida, enviada ou com falha). */
@Composable
private fun rememberSmsVersion(): Int {
    val ctx = LocalContext.current
    var version by remember { mutableIntStateOf(0) }
    DisposableEffect(Unit) {
        val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) { version++ }
        }
        ctx.contentResolver.registerContentObserver(Telephony.Sms.CONTENT_URI, true, observer)
        onDispose { ctx.contentResolver.unregisterContentObserver(observer) }
    }
    return version
}

@Composable
private fun ActivationScreen(refused: Boolean, onActivate: () -> Unit) {
    ScreenColumn {
        BigTitle("Use a Simvio como app de SMS")
        Lead("Indicado para um aparelho dedicado às verificações. Todas as mensagens deste chip passam a ser recebidas e enviadas por aqui.")
        SimvioCard {
            CheckRow("Suas mensagens ficam no aparelho", "Só as mensagens SIMVIO são encaminhadas à Simvio. As demais não saem do celular.", CheckState.OK)
            CheckRow("Enviar só com o seu toque", "A Simvio nunca envia SMS sozinha deste chip.", CheckState.OK)
            CheckRow("MMS não é recebido", "Mensagens com foto ou áudio não chegam enquanto este for o app padrão.", CheckState.WARN)
            CheckRow("Mensagens SIMVIO não ficam guardadas", "Com o aparelho conectado, elas não aparecem nas conversas: estão em Atividade.", CheckState.OK)
        }
        if (refused) ErrorText("O Android não definiu a Simvio como app padrão. Tente de novo ou confira em Ajustes do Android › Apps padrão.")
        PrimaryButton("Definir como app de SMS padrão", onClick = onActivate)
        Lead("Você pode voltar ao app anterior a qualquer momento em Ajustes do Android › Apps padrão.")
    }
}

@Composable
private fun Header(title: String, onBack: () -> Unit, action: @Composable () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Voltar", tint = Petroleo) }
        Text(title, style = MaterialTheme.typography.titleLarge, color = Petroleo, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        action()
    }
}

private fun time(millis: Long) =
    DateUtils.getRelativeTimeSpanString(millis, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS).toString()

@Composable
private fun InboxScreen(onOpen: (String) -> Unit, onNew: () -> Unit, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val version = rememberSmsVersion()
    val items by produceState<List<SmsConversation>?>(null, version) {
        value = withContext(Dispatchers.IO) { SmsBox.conversations(ctx) }
    }
    Column(Modifier.fillMaxSize()) {
        Header("Mensagens", onBack) {
            IconButton(onClick = onNew) { Icon(Icons.Filled.Add, contentDescription = "Nova mensagem", tint = Petroleo) }
        }
        val list = items
        if (list != null && list.isEmpty()) Text("Nenhuma mensagem ainda.", color = PetroleoSuave, modifier = Modifier.padding(22.dp))
        LazyColumn(Modifier.fillMaxSize()) {
            items(list.orEmpty(), key = { it.last.threadId }) { c ->
                Column(Modifier.fillMaxWidth().clickable { onOpen(c.last.address) }.padding(horizontal = 22.dp, vertical = 14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(c.last.address, color = Petroleo, fontWeight = if (c.unread > 0) FontWeight.Bold else FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Text(time(c.last.date), color = PetroleoSuave, style = MaterialTheme.typography.bodySmall)
                    }
                    Text(
                        (if (c.unread > 0) "${c.unread} nova(s) · " else "") + c.last.body,
                        color = PetroleoSuave, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                }
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun ThreadScreen(target: Open, onBack: () -> Unit, onAddress: (String) -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val version = rememberSmsVersion()
    var addressDraft by rememberSaveable(target.address) { mutableStateOf(target.address) }
    var text by rememberSaveable(target.address, target.draft) { mutableStateOf(target.draft) }
    var error by remember { mutableStateOf<String?>(null) }
    val rows by produceState<List<SmsRow>>(emptyList(), target.address, version) {
        value = if (target.address.isBlank()) emptyList() else withContext(Dispatchers.IO) { SmsBox.thread(ctx, target.address) }
    }
    val listState = rememberLazyListState()
    LaunchedEffect(rows.size) { if (rows.isNotEmpty()) listState.scrollToItem(rows.lastIndex) }

    Column(Modifier.fillMaxSize()) {
        Header(target.address.ifBlank { "Nova mensagem" }, onBack)
        if (target.address.isBlank()) OutlinedTextField(
            value = addressDraft,
            onValueChange = { addressDraft = it.filter { c -> c.isDigit() || c in "+()- " }.take(20) },
            label = { Text("Número") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp),
        )
        LazyColumn(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 14.dp), state = listState, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(rows, key = { it.id }) { Bubble(it) }
        }
        ErrorText(error)
        Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(value = text, onValueChange = { text = it }, label = { Text("Mensagem") }, maxLines = 4, modifier = Modifier.weight(1f))
            val address = target.address.ifBlank { addressDraft.trim() }
            IconButton(
                enabled = text.isNotBlank() && address.count { it.isDigit() } >= 3,
                onClick = {
                    val body = text
                    scope.launch {
                        val result = withContext(Dispatchers.IO) { runCatching { SmsBox.send(ctx, address, body) } }
                        error = result.exceptionOrNull()?.let { "Não foi possível enviar. Confira o chip e tente de novo." }
                        if (result.isSuccess) {
                            text = ""
                            onAddress(address)
                        }
                    }
                },
            ) { Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Enviar", tint = Petroleo) }
        }
    }
}

@Composable
private fun Bubble(row: SmsRow) {
    Box(Modifier.fillMaxWidth(), contentAlignment = if (row.outgoing) Alignment.CenterEnd else Alignment.CenterStart) {
        Column(
            Modifier.widthIn(max = 300.dp)
                .background(if (row.outgoing) Lima else Branco, RoundedCornerShape(14.dp))
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            Text(row.body, color = Petroleo)
            Text(
                if (row.failed) "Não enviada" else time(row.date),
                color = if (row.failed) Erro else PetroleoSuave,
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}
