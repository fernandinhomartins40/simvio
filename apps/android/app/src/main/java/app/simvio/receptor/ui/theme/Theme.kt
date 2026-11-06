package app.simvio.receptor.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// Paleta oficial (PRD §20): petróleo, lima, mineral e branco.
val Petroleo = Color(0xFF073E42)
val Lima = Color(0xFFC6F36A)
val Mineral = Color(0xFFF3F7F3)
val Branco = Color(0xFFFFFFFF)
val PetroleoSuave = Color(0xFF3D6467)
val Linha = Color(0xFFDDE7E2)
val Sucesso = Color(0xFF1F8A4C)
val Alerta = Color(0xFFB45309)
val Erro = Color(0xFFB42318)

private val colors = lightColorScheme(
    primary = Petroleo,
    onPrimary = Branco,
    secondary = Lima,
    onSecondary = Petroleo,
    background = Mineral,
    onBackground = Petroleo,
    surface = Branco,
    onSurface = Petroleo,
    surfaceVariant = Mineral,
    onSurfaceVariant = PetroleoSuave,
    outline = Linha,
    error = Erro,
)

private val typography = Typography(
    headlineLarge = TextStyle(fontSize = 32.sp, lineHeight = 36.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.5).sp),
    headlineSmall = TextStyle(fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.Bold),
    titleMedium = TextStyle(fontSize = 17.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 17.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontSize = 15.sp, lineHeight = 21.sp),
    labelLarge = TextStyle(fontSize = 17.sp, fontWeight = FontWeight.Bold),
)

@Composable
fun SimvioTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, typography = typography, content = content)
}
