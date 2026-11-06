# Prova técnica do núcleo — roteiro com SMS real

Objetivo (PRD §15, etapa 0): sessão criada → usuário envia SMS real → Android recebe → API valida →
backend integrado recebe (webhook) ou consulta o resultado.

## O que você precisa

- Android 8+ dedicado, com **um** chip ativo que recebe SMS (o "receptor").
- Um segundo celular com chip (o "usuário") para enviar os SMS.
- Computador com Node 22+, Docker e o repositório.
- Receptor e computador na mesma rede (Wi-Fi) **ou** a API publicada em HTTPS.

## 1. Subir banco, API e worker (desenvolvimento)

```bash
docker compose -f compose.dev.yaml up -d db
cp apps/api/.env.example apps/api/.env      # se ainda não existir; gere as chaves indicadas
npm install
npm run migrate:deploy -w @simvio/api
npm run dev -w @simvio/api                  # API em http://0.0.0.0:3101
npm run dev:worker -w @simvio/api           # outro terminal
npm run dev -w @simvio/web                  # página pública em http://localhost:5174 (opcional)
```

Descubra o IP do computador na rede local (ex.: `192.168.0.10`). O Android debug aceita http.
Para que os links públicos funcionem no celular do usuário, ajuste `PUBLIC_BASE_URL` para
`http://<IP>:5174` e reinicie a API.

## 2. Criar o tenant de teste

```bash
npm run bootstrap -w @simvio/api -- --email voce@exemplo.com --org "Minha loja" \
  --webhook http://127.0.0.1:4000/webhooks/simvio
```

Anote a chave `sk_test_…`, o segredo `whsec_…` e o código de pareamento (vale 5 min).
Código vencido: `npm run bootstrap -w @simvio/api -- --pair --org-id <id>`.

## 3. Instalar e parear o receptor

```bash
adb install -r apps/android/app/build/outputs/apk/debug/app-debug.apk
```

No app: "Conectar este Android" → endereço `http://<IP>:3101` → código → Conectar.
Permita "SMS". Digite o número do chip do receptor. Do celular do **usuário**, envie a mensagem
mostrada (ou escaneie o QR) para o número do receptor. A tela deve mudar para **Linha pronta**.

## 4. Backend integrado (exemplo Node)

```bash
cd examples/node
SIMVIO_API_BASE=http://127.0.0.1:3101 SIMVIO_SECRET_KEY=sk_test_... \
SIMVIO_WEBHOOK_SECRET=whsec_... PORT=4000 node server.mjs
```

Abra `http://localhost:4000`, informe o celular do **usuário** em E.164 (`+55DDDNÚMERO`).
Abra o link "Confirmar meu número" no celular do usuário (ou leia o QR da página no computador),
toque em **Abrir mensagens** e envie. Em poucos segundos:

- a página pública mostra **Número confirmado**;
- o terminal do exemplo mostra `cadastro … ativado`;
- `GET /signup/<id>` mostra status `active`.

## 5. Registrar evidências

Para cada caso de `docs/ANDROID.md › Matriz de validação física`, anote: aparelho, Android, operadora,
data/hora, resultado, tempo SMS→aprovação (log do worker / `verified_at` – horário de envio).
Atualize `docs/STATUS.md`. **Simulador/emulador não satisfaz o aceite físico.**

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| `receiver_unavailable` ao criar | Linha não validada ou sem heartbeat há mais de 60 min — abra o app e toque "Atualizar agora" |
| Nada chega no app | Permissão SMS negada, app forçado a parar, mensagem enviada como RCS/iMessage |
| "Remetente diferente" | O usuário enviou de outro chip/número; envie pelo número informado |
| "Recebido em outro chip" | Receptor dual SIM: o SMS chegou em SIM diferente do validado |
| Chegou após o prazo | Sessão de 5 min expirou; crie nova verificação |
