# Guia para agentes de IA: integrar a Simvio

A Simvio verifica celulares por SMS reverso: o usuário envia um SMS do próprio número para um Android receptor, e a Simvio confirma. A Simvio nunca envia código por SMS.

## Ordem de configuração

1. `ver_situacao` mostra o que já está pronto.
2. `criar_aplicacao` cria a aplicação (use `listar_aplicacoes` antes, para não duplicar).
3. `criar_chave_api` com ambiente `test` gera a chave do servidor. Grave em variável de ambiente, nunca no código nem no navegador.
4. `gerar_codigo_de_pareamento` gera o código para o app Simvio Receptor. A pessoa digita o código no Android e confirma o número do chip no app.
5. `criar_aviso_automatico` cadastra o endereço HTTPS que recebe os avisos. Grave o segredo de assinatura em variável de ambiente.
6. `definir_urls_de_retorno` libera os endereços de volta ao site, se a integração usar `redirect_url`.
7. `criar_verificacao_de_teste` cria uma sessão de teste. O dono do número envia o SMS; `consultar_verificacoes` mostra o resultado.

## Fluxo no servidor do cliente

1. O servidor cria a verificação com `POST /api/v1/verifications`, usando `Authorization: Bearer sk_test_...` e o cabeçalho `Idempotency-Key`.
2. O servidor leva o usuário para `verification_url`.
3. Ao receber o aviso `verification.verified`, o servidor confere a assinatura, ignora `event_id` repetido e confirma com `GET /api/v1/verifications/{id}` antes de liberar o usuário.

A chave `sk_` fica só no servidor. Nunca coloque essa chave em código de navegador ou aplicativo.

## Assinatura dos avisos automáticos

O cabeçalho `Simvio-Signature: v1=<hex>` é o HMAC-SHA256 de `${Simvio-Timestamp}.${Simvio-Event-Id}.${corpo bruto}` com o segredo `whsec_`. Compare em tempo constante e recuse carimbo de tempo com mais de 5 minutos de diferença.

## Teste e produção

Teste não conta no limite do plano. Com a permissão de produção desligada na chave de agente, as ferramentas recusam qualquer alteração em produção. Para ligar a produção de uma aplicação, a pessoa usa o painel.

## O que o agente não faz

Excluir organização, revogar aparelho, mudar plano, gerenciar equipe e criar chave de agente são ações feitas só no painel.
