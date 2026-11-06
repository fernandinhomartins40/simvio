<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Cliente Simvio para Laravel 10+ (HTTP Client do framework).
 * Configuração em config/services.php → 'simvio' (lida de variáveis de ambiente; nunca no código).
 */
class SimvioService
{
    public function __construct(
        private readonly string $apiBase,
        private readonly string $secretKey,
        private readonly string $webhookSecret,
    ) {}

    public static function fromConfig(): self
    {
        $c = config('services.simvio');
        return new self(rtrim((string) $c['api_base'], '/'), (string) $c['secret_key'], (string) ($c['webhook_secret'] ?? ''));
    }

    /** @return array<string, mixed> */
    public function createVerification(string $phoneE164, string $reference, string $idempotencyKey, ?string $redirectUrl = null): array
    {
        $body = array_filter([
            'phone_number' => $phoneE164,
            'reference' => $reference,
            'purpose' => 'signup',
            'redirect_url' => $redirectUrl,
        ], fn ($v) => $v !== null);

        return $this->client()
            ->withHeaders(['Idempotency-Key' => $idempotencyKey])
            // Repetição segura: a mesma Idempotency-Key devolve a mesma verificação.
            ->retry(2, 500, fn ($e) => $e instanceof \Illuminate\Http\Client\ConnectionException
                || ($e instanceof RequestException && $e->response->serverError() && $e->response->status() !== 503))
            ->post('/v1/verifications', $body)
            ->throw()
            ->json();
    }

    /** @return array<string, mixed> */
    public function getVerification(string $id): array
    {
        return $this->client()->get('/v1/verifications/' . rawurlencode($id))->throw()->json();
    }

    /**
     * Valida assinatura, tolerância de tempo e coerência do event_id.
     *
     * @return array<string, mixed>
     */
    public function verifyWebhook(string $rawBody, ?string $eventId, ?string $timestamp, ?string $signature, int $toleranceSeconds = 300): array
    {
        if ($this->webhookSecret === '') {
            throw new RuntimeException('SIMVIO_WEBHOOK_SECRET não configurado');
        }
        if (!$eventId || !$timestamp || !ctype_digit($timestamp) || !$signature || !str_starts_with($signature, 'v1=')) {
            throw new RuntimeException('Cabeçalhos de assinatura ausentes');
        }
        if (abs(time() - (int) $timestamp) > $toleranceSeconds) {
            throw new RuntimeException('Timestamp fora da tolerância');
        }
        $expected = hash_hmac('sha256', "{$timestamp}.{$eventId}.{$rawBody}", $this->webhookSecret);
        if (!hash_equals($expected, substr($signature, 3))) {
            throw new RuntimeException('Assinatura inválida');
        }
        $payload = json_decode($rawBody, true, 16, JSON_THROW_ON_ERROR);
        if (($payload['event_id'] ?? null) !== $eventId) {
            throw new RuntimeException('event_id divergente');
        }
        return $payload;
    }

    private function client()
    {
        return Http::baseUrl($this->apiBase)
            ->withToken($this->secretKey)
            ->acceptJson()
            ->timeout(15)
            ->withOptions(['allow_redirects' => false]);
    }
}
