<?php

declare(strict_types=1);

namespace Simvio;

/**
 * Validação de webhook Simvio.
 * Assinatura = HMAC-SHA256(segredo, "{timestamp}.{eventId}.{corpoBruto}") em hex; cabeçalho "v1=<hex>".
 */
final class Webhook
{
    /**
     * @param string $rawBody corpo BRUTO recebido (php://input), antes de qualquer json_decode
     * @param array<string, string|null> $headers cabeçalhos com nomes em minúsculas
     * @return array<string, mixed> payload validado
     */
    public static function verify(
        string $rawBody,
        array $headers,
        string $secret,
        int $toleranceSeconds = 300,
        ?int $now = null,
    ): array {
        $eventId = (string) ($headers['simvio-event-id'] ?? '');
        $timestamp = (string) ($headers['simvio-timestamp'] ?? '');
        $signature = (string) ($headers['simvio-signature'] ?? '');

        if ($eventId === '' || !ctype_digit($timestamp) || !str_starts_with($signature, 'v1=')) {
            throw new \UnexpectedValueException('Cabeçalhos de assinatura ausentes');
        }
        if (abs(($now ?? time()) - (int) $timestamp) > $toleranceSeconds) {
            throw new \UnexpectedValueException('Timestamp fora da tolerância (possível repetição)');
        }
        $expected = self::sign($secret, (int) $timestamp, $eventId, $rawBody);
        // Comparação em tempo constante.
        if (!hash_equals($expected, substr($signature, 3))) {
            throw new \UnexpectedValueException('Assinatura inválida');
        }
        $payload = json_decode($rawBody, true, 16, JSON_THROW_ON_ERROR);
        if (!is_array($payload) || ($payload['event_id'] ?? null) !== $eventId) {
            throw new \UnexpectedValueException('event_id divergente');
        }
        return $payload;
    }

    public static function sign(string $secret, int $timestamp, string $eventId, string $rawBody): string
    {
        return hash_hmac('sha256', "{$timestamp}.{$eventId}.{$rawBody}", $secret);
    }
}
