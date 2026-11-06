package app.simvio.receptor.ui

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import app.simvio.receptor.R
import app.simvio.receptor.ui.theme.Alerta
import app.simvio.receptor.ui.theme.Branco
import app.simvio.receptor.ui.theme.Erro
import app.simvio.receptor.ui.theme.Lima
import app.simvio.receptor.ui.theme.Linha
import app.simvio.receptor.ui.theme.Petroleo
import app.simvio.receptor.ui.theme.PetroleoSuave
import app.simvio.receptor.ui.theme.Sucesso
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter

/** Logo oficial (PNG de 01_IDENTIDADE_VISUAL), proporção preservada. */
@Composable
fun SimvioLogo(modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(R.drawable.simvio_logo),
        contentDescription = "Simvio",
        contentScale = ContentScale.Fit,
        modifier = modifier.height(56.dp).width(134.dp),
    )
}

/** Título grande com o ponto final em lima, como nas referências. */
@Composable
fun BigTitle(text: String) {
    Text(
        buildAnnotatedString {
            append(text)
            withStyle(SpanStyle(color = Lima)) { append(".") }
        },
        style = MaterialTheme.typography.headlineLarge,
        color = Petroleo,
        modifier = Modifier.semantics { heading() },
    )
}

@Composable
fun Lead(text: String) {
    Text(text, style = MaterialTheme.typography.bodyLarge, color = PetroleoSuave)
}

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, enabled: Boolean = true, loading: Boolean = false, modifier: Modifier = Modifier) {
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        shape = RoundedCornerShape(16.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Lima, contentColor = Petroleo, disabledContainerColor = Linha, disabledContentColor = PetroleoSuave),
        modifier = modifier.fillMaxWidth().heightIn(min = 56.dp),
    ) {
        if (loading) CircularProgressIndicator(Modifier.size(22.dp), color = Petroleo, strokeWidth = 2.dp)
        else Text(text, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
fun SecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    OutlinedButton(onClick = onClick, shape = RoundedCornerShape(16.dp), modifier = modifier.fillMaxWidth().heightIn(min = 52.dp)) {
        Text(text, color = Petroleo, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
fun SimvioCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .background(Branco, RoundedCornerShape(20.dp))
            .border(1.dp, Linha, RoundedCornerShape(20.dp))
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        content = content,
    )
}

enum class CheckState { OK, WARN, ERROR }

/** Linha de checklist: estado sempre com ícone + texto (não depende só de cor). */
@Composable
fun CheckRow(title: String, subtitle: String, state: CheckState) {
    val (icon, tint, label) = when (state) {
        CheckState.OK -> Triple(Icons.Filled.CheckCircle, Sucesso, "ok")
        CheckState.WARN -> Triple(Icons.Filled.WarningAmber, Alerta, "atenção")
        CheckState.ERROR -> Triple(Icons.Filled.ErrorOutline, Erro, "problema")
    }
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}) {
        Icon(icon, contentDescription = label, tint = tint, modifier = Modifier.size(28.dp))
        Spacer(Modifier.width(14.dp))
        Column {
            Text(title, style = MaterialTheme.typography.titleMedium, color = Petroleo)
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = PetroleoSuave)
        }
    }
}

@Composable
fun StatusPill(text: String, ok: Boolean) {
    Row(
        Modifier.background(if (ok) Lima.copy(alpha = 0.35f) else Color(0xFFFDE7C7), RoundedCornerShape(50)).padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(10.dp).background(if (ok) Sucesso else Alerta, CircleShape))
        Spacer(Modifier.width(8.dp))
        Text(text, color = Petroleo, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
fun ErrorText(text: String?) {
    if (text != null) Text(text, color = Erro, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.semantics { contentDescription = "Erro: $text"; liveRegion = LiveRegionMode.Polite })
}

@Composable
fun IconBadge(icon: ImageVector, tint: Color = Petroleo) {
    Box(Modifier.size(44.dp).background(Lima.copy(alpha = 0.3f), CircleShape), contentAlignment = Alignment.Center) {
        Icon(icon, contentDescription = null, tint = tint)
    }
}

/** QR real gerado localmente (zxing). */
@Composable
fun QrCode(content: String, description: String, modifier: Modifier = Modifier) {
    val bitmap: ImageBitmap = remember(content) {
        val hints = mapOf(EncodeHintType.MARGIN to 1)
        val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, 512, 512, hints)
        val bmp = Bitmap.createBitmap(matrix.width, matrix.height, Bitmap.Config.RGB_565)
        for (x in 0 until matrix.width) for (y in 0 until matrix.height) {
            bmp.setPixel(x, y, if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
        }
        bmp.asImageBitmap()
    }
    Image(bitmap, contentDescription = description, modifier = modifier)
}
