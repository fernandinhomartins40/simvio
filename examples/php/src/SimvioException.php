<?php

declare(strict_types=1);

namespace Simvio;

/** Erro da API. Decida pelo $errorCode (ex.: receiver_unavailable, rate_limited), não pela mensagem. */
final class SimvioException extends \RuntimeException
{
    public function __construct(string $message, public readonly int $httpStatus, public readonly ?string $errorCode)
    {
        parent::__construct($message, $httpStatus);
    }
}
