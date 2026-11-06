package app.simvio.receptor.sms

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SmsParserTest {
    private val token = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

    @Test
    fun aceitaSomenteFormatoExato() {
        assertEquals(token, SmsParser.extractToken("SIMVIO $token"))
        assertEquals(token, SmsParser.extractToken("  simvio ${token.lowercase()} \n"))
        assertNull(SmsParser.extractToken("Olá SIMVIO $token"))
        assertNull(SmsParser.extractToken("SIMVIO $token obrigado"))
        assertNull(SmsParser.extractToken("SIMVIO ${token.drop(1)}"))
        assertNull(SmsParser.extractToken("Seu código do banco é 123456"))
    }

    @Test
    fun mensagensNaoSimvioSaoDescartadas() {
        val parts = listOf(
            SmsPart("+5511999990001", "Promoção imperdível", 1),
            SmsPart("BANCO", "Seu código é 1234", 2),
        )
        assertTrue(SmsParser.parse(parts).isEmpty())
    }

    @Test
    fun remontaMultipartesDoMesmoRemetente() {
        val parts = listOf(
            SmsPart("+5511999990001", "SIMVIO ABCDEFGHIJKLM", 10),
            SmsPart("+5511999990001", "NOPQRSTUVWXYZ", 11),
            SmsPart("+5511999990002", "oi", 12),
        )
        val out = SmsParser.parse(parts)
        assertEquals(1, out.size)
        assertEquals(token, out[0].token)
        assertEquals("+5511999990001", out[0].sender)
        assertEquals(10L, out[0].timestampMillis)
    }

    @Test
    fun eventIdEstavelParaMesmoSms() {
        val sms = SimvioSms("+5511999990001", token, 1000)
        assertEquals(SmsParser.eventId(sms, 1), SmsParser.eventId(sms, 1))
        assertNotEquals(SmsParser.eventId(sms, 1), SmsParser.eventId(sms.copy(timestampMillis = 1001), 1))
        assertNotEquals(SmsParser.eventId(sms, 1), SmsParser.eventId(sms, 2))
        assertTrue(SmsParser.eventId(sms, null).length in 8..128)
    }

    @Test
    fun mascaraRemetente() {
        assertEquals("••••0001", SmsParser.maskSender("+5511999990001"))
        assertEquals("remetente não numérico", SmsParser.maskSender("BANCO"))
    }
}
