<?php

declare(strict_types=1);

// Teste sem dependências: php tests/signature_test.php
// Compara com vetores gerados pela implementação Node da API (signPayload) e cobre os casos de rejeição.

require __DIR__ . '/../src/Webhook.php';

use Simvio\Webhook;

$fails = 0;
function check(string $name, bool $ok): void
{
    global $fails;
    echo ($ok ? 'ok   ' : 'FALHA') . " - {$name}\n";
    if (!$ok) {
        $fails++;
    }
}
function rejects(callable $fn): bool
{
    try {
        $fn();
        return false;
    } catch (\UnexpectedValueException) {
        return true;
    }
}

$vectorFile = $argv[1] ?? __DIR__ . '/vectors.json';
$vectors = json_decode((string) file_get_contents($vectorFile), true, 16, JSON_THROW_ON_ERROR);

foreach ($vectors as $i => $v) {
    $sig = Webhook::sign($v['secret'], $v['timestamp'], $v['event_id'], $v['body']);
    check("vetor {$i}: assinatura igual à da API (Node)", hash_equals($v['signature'], $sig));

    $headers = [
        'simvio-event-id' => $v['event_id'],
        'simvio-timestamp' => (string) $v['timestamp'],
        'simvio-signature' => 'v1=' . $v['signature'],
    ];
    $payload = Webhook::verify($v['body'], $headers, $v['secret'], 300, $v['timestamp'] + 10);
    check("vetor {$i}: verify aceita e devolve payload", $payload['event_id'] === $v['event_id']);

    check("vetor {$i}: rejeita corpo alterado", rejects(fn () => Webhook::verify($v['body'] . ' ', $headers, $v['secret'], 300, $v['timestamp'])));
    check("vetor {$i}: rejeita segredo errado", rejects(fn () => Webhook::verify($v['body'], $headers, 'whsec_outro', 300, $v['timestamp'])));
    check("vetor {$i}: rejeita timestamp velho", rejects(fn () => Webhook::verify($v['body'], $headers, $v['secret'], 300, $v['timestamp'] + 301)));
    check("vetor {$i}: rejeita sem cabeçalhos", rejects(fn () => Webhook::verify($v['body'], [], $v['secret'])));
    $other = $headers;
    $other['simvio-event-id'] = 'evt_outro';
    check("vetor {$i}: rejeita event_id trocado", rejects(fn () => Webhook::verify($v['body'], $other, $v['secret'], 300, $v['timestamp'])));
}

echo $fails === 0 ? "\nTodos os testes passaram.\n" : "\n{$fails} falha(s).\n";
exit($fails === 0 ? 0 : 1);
