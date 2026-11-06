package app.simvio.receptor.sms

import java.security.MessageDigest

/** Parte de SMS entregue pelo sistema (PDU já decodificada). */
data class SmsPart(val sender: String, val body: String, val timestampMillis: Long)

/** Mensagem completa (multipartes remontadas) que segue o formato Simvio. */
data class SimvioSms(val sender: String, val token: String, val timestampMillis: Long)

object SmsParser {
    /** Mesmo formato do servidor: "SIMVIO <token Base32 de 26 caracteres>", sem texto adicional. */
    private val MESSAGE = Regex("^\\s*SIMVIO\\s+([A-Za-z2-7]{26})\\s*$", RegexOption.IGNORE_CASE)

    fun extractToken(body: String): String? = MESSAGE.matchEntire(body)?.groupValues?.get(1)?.uppercase()

    /**
     * Remonta multipartes (mesmo remetente, na ordem recebida) e devolve SOMENTE mensagens Simvio.
     * Qualquer outra mensagem é descartada aqui: não é persistida nem enviada.
     */
    fun parse(parts: List<SmsPart>): List<SimvioSms> {
        val grouped = LinkedHashMap<String, MutableList<SmsPart>>()
        for (p in parts) grouped.getOrPut(p.sender) { mutableListOf() }.add(p)
        return grouped.mapNotNull { (sender, list) ->
            val body = list.joinToString("") { it.body }
            extractToken(body)?.let { SimvioSms(sender, it, list.first().timestampMillis) }
        }
    }

    /**
     * Identificador estável do evento: o mesmo SMS entregue duas vezes gera o mesmo id,
     * permitindo repetição segura (o servidor deduplica por aparelho + event_id).
     */
    fun eventId(sms: SimvioSms, subscriptionId: Int?): String {
        val raw = "${sms.sender}|${sms.token}|${sms.timestampMillis}|${subscriptionId ?: -1}"
        val digest = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray())
        return "sms_" + digest.joinToString("") { "%02x".format(it) }.take(40)
    }

    /** Remetente mascarado para o registro de atividade local (nunca o número completo). */
    fun maskSender(sender: String): String {
        val digits = sender.filter { it.isDigit() }
        return if (digits.length >= 4) "••••${digits.takeLast(4)}" else "remetente não numérico"
    }
}
