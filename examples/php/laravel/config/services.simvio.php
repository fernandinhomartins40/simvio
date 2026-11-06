<?php

// Acrescente esta chave ao array de config/services.php.
// Valores vêm do .env do seu servidor (nunca do repositório nem do frontend).

return [
    'simvio' => [
        'api_base' => env('SIMVIO_API_BASE'),            // ex.: https://simvio.seudominio.com.br/api
        'secret_key' => env('SIMVIO_SECRET_KEY'),        // sk_test_... ou sk_live_...
        'webhook_secret' => env('SIMVIO_WEBHOOK_SECRET'), // whsec_...
    ],
];
