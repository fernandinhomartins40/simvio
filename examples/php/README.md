# Simvio em PHP e Laravel

Exemplos para o **backend** que integra a Simvio. A chave secreta (`sk_test_…`/`sk_live_…`) e o segredo
de webhook (`whsec_…`) ficam só no servidor — nunca no HTML, JavaScript ou app.

```
examples/php/
├── src/                      PHP puro (8.1+, extensões curl e json)
│   ├── SimvioClient.php      criar, consultar e cancelar verificações
│   ├── SimvioException.php   erro da API com o código estável (error.code)
│   └── Webhook.php           validação da assinatura do aviso automático
├── laravel/                  arquivos para copiar num projeto Laravel 10+
│   ├── app/Services/SimvioService.php
│   ├── app/Providers/SimvioServiceProvider.php
│   ├── app/Http/Controllers/SignupController.php       cadastro + confirmação
│   ├── app/Http/Controllers/SimvioWebhookController.php
│   ├── app/Models/Signup.php
│   ├── config/services.simvio.php                       trecho para config/services.php
│   ├── database/migrations/…_create_simvio_example_tables.php
│   ├── resources/views/signup/status.blade.php
│   └── routes/simvio.php
└── tests/                    teste da assinatura contra vetores gerados pela API
```

## Como funciona

1. O usuário informa o celular no seu cadastro.
2. Seu backend chama `POST /api/v1/verifications` com `phone_number` (E.164), `reference` (id do cadastro)
   e o cabeçalho `Idempotency-Key` (estável por tentativa, ex.: `"{id}:{tentativa}"`).
3. Você leva o usuário para `verification_url`. A página da Simvio mostra o número receptor e a mensagem
   e abre o aplicativo de mensagens do próprio usuário. **A Simvio não envia SMS.**
4. Quando o SMS correto chega ao aparelho receptor, a Simvio envia o aviso `verification.verified`.
5. Seu backend valida a assinatura, ignora eventos repetidos (`event_id`) e **confirma com
   `GET /api/v1/verifications/{id}`** que o status é `verified`, que `reference` é o seu cadastro e que o
   telefone é o informado. Só então ativa — uma única vez.

A volta do usuário pela `redirect_url` **não prova nada**: na página de status, o exemplo consulta a API.
Isso também recupera o caso de um aviso automático perdido.

## PHP puro

```php
require 'src/SimvioClient.php';
require 'src/SimvioException.php';
require 'src/Webhook.php';

$simvio = new Simvio\SimvioClient(getenv('SIMVIO_API_BASE'), getenv('SIMVIO_SECRET_KEY'));

try {
    $v = $simvio->createVerification('+5511987654321', $cadastroId, "{$cadastroId}:1");
    header('Location: ' . $v['verification_url']);
} catch (Simvio\SimvioException $e) {
    // receiver_unavailable, rate_limited, plan_limit, suspended, invalid_request...
    error_log("simvio: {$e->errorCode}");
}

// Endpoint de webhook
$raw = file_get_contents('php://input');            // corpo BRUTO
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
try {
    $event = Simvio\Webhook::verify($raw, $headers, getenv('SIMVIO_WEBHOOK_SECRET'));
} catch (UnexpectedValueException $e) {
    http_response_code(400);
    exit;
}
// 1) grave $event['event_id'] numa tabela com chave única (se já existir, responda 204 e pare);
// 2) confirme com $simvio->getVerification($event['verification_id']) antes de ativar.
http_response_code(204);
```

## Laravel

1. Copie os arquivos de `laravel/` para os mesmos caminhos do seu projeto.
2. Em `config/services.php`, acrescente a chave `simvio` de `config/services.simvio.php`.
3. Registre `App\Providers\SimvioServiceProvider` (`bootstrap/providers.php` no Laravel 11+).
4. Inclua `require __DIR__.'/simvio.php';` em `routes/web.php`.
5. Tire o webhook da verificação CSRF:
   - Laravel 11+ (`bootstrap/app.php`):
     `->withMiddleware(fn ($m) => $m->validateCsrfTokens(except: ['webhooks/simvio']))`
   - Laravel 10: acrescente `'webhooks/simvio'` em `$except` de `App\Http\Middleware\VerifyCsrfToken`.
6. `.env` do servidor:
   ```
   SIMVIO_API_BASE=https://simvio.seudominio.com.br/api
   SIMVIO_SECRET_KEY=sk_test_...
   SIMVIO_WEBHOOK_SECRET=whsec_...
   ```
7. `php artisan migrate`.
8. No painel da Simvio, em **Avisos automáticos**, cadastre `https://seu-app/webhooks/simvio`.

Pontos que o exemplo já trata:

- assinatura `v1=` calculada sobre o corpo bruto e comparada com `hash_equals` (tempo constante);
- tolerância de 5 minutos no `Simvio-Timestamp`;
- deduplicação por `event_id` com chave primária (seguro com entregas paralelas);
- falha no processamento devolve 500 e libera o `event_id`, para a Simvio tentar de novo;
- ativação dentro de transação com `lockForUpdate` (ativa uma vez só);
- nova tentativa usa nova `Idempotency-Key`; a Simvio cancela a sessão anterior da mesma `reference`;
- redirecionamentos HTTP não são seguidos ao chamar a API.

## Testes

```
php tests/signature_test.php
```

`tests/vectors.json` foi gerado com a função `signPayload` da própria API (Node), inclusive com acentos e
emoji no corpo. O teste confere que o PHP produz a mesma assinatura e que rejeita corpo alterado, segredo
errado, timestamp fora da tolerância, cabeçalhos ausentes e `event_id` trocado.

A especificação completa está em [`docs/openapi.yaml`](../../docs/openapi.yaml).
