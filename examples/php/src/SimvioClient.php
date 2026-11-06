<?php

declare(strict_types=1);

namespace Simvio;

/**
 * Cliente mínimo da API Simvio para PHP 8.1+ (somente extensões curl e json).
 * A chave secreta fica SOMENTE no servidor. Nunca envie para o navegador.
 */
final class SimvioClient
{
    private string $apiBase;

    /**
     * @param string $apiBase   ex.: https://seu-dominio/api
     * @param string $secretKey sk_test_... ou sk_live_...
     */
    public function __construct(string $apiBase, private string $secretKey, private int $timeoutSeconds = 15)
    {
        $this->apiBase = rtrim($apiBase, '/');
    }

    /**
     * Cria uma verificação. Use uma Idempotency-Key estável por tentativa (ex.: id do cadastro + tentativa):
     * repetir a chamada com a mesma chave devolve a mesma sessão.
     *
     * @return array<string, mixed>
     */
    public function createVerification(
        string $phoneNumber,
        string $reference,
        string $idempotencyKey,
        string $purpose = 'signup',
        ?string $redirectUrl = null,
    ): array {
        $body = ['phone_number' => $phoneNumber, 'reference' => $reference, 'purpose' => $purpose];
        if ($redirectUrl !== null) {
            $body['redirect_url'] = $redirectUrl;
        }
        return $this->request('POST', '/v1/verifications', $body, ['Idempotency-Key: ' . $idempotencyKey]);
    }

    /** @return array<string, mixed> */
    public function getVerification(string $id): array
    {
        return $this->request('GET', '/v1/verifications/' . rawurlencode($id));
    }

    /** @return array<string, mixed> */
    public function cancelVerification(string $id): array
    {
        return $this->request('POST', '/v1/verifications/' . rawurlencode($id) . '/cancel');
    }

    /**
     * @param array<string, mixed>|null $body
     * @param list<string> $headers
     * @return array<string, mixed>
     */
    private function request(string $method, string $path, ?array $body = null, array $headers = []): array
    {
        $ch = curl_init($this->apiBase . $path);
        $headers[] = 'Authorization: Bearer ' . $this->secretKey;
        $headers[] = 'Accept: application/json';
        $opts = [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT => $this->timeoutSeconds,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP,
        ];
        if ($body !== null) {
            $headers[] = 'Content-Type: application/json';
            $opts[CURLOPT_POSTFIELDS] = json_encode($body, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        }
        $opts[CURLOPT_HTTPHEADER] = $headers;
        curl_setopt_array($ch, $opts);

        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $netError = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            throw new SimvioException('Falha de rede ao chamar a Simvio: ' . $netError, 0, 'network_error');
        }
        $json = json_decode((string) $raw, true);
        if ($status < 200 || $status >= 300) {
            $err = is_array($json) ? ($json['error'] ?? []) : [];
            throw new SimvioException(
                (string) ($err['message'] ?? "Simvio respondeu {$status}"),
                $status,
                isset($err['code']) ? (string) $err['code'] : null,
            );
        }
        if (!is_array($json)) {
            throw new SimvioException('Resposta inválida da Simvio', $status, 'invalid_response');
        }
        return $json;
    }
}
