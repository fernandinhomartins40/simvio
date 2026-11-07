# Implantação da Simvio numa VPS

> **Produção atual (simvio.com.br, VPS 72.60.10.108):** o deploy acontece **somente** pelo GitHub Actions
> (`.github/workflows/deploy.yml`): testes → build das imagens no GitHub → publicação no GHCR → a VPS só baixa
> as imagens por SSH (`scripts/vps-deploy.sh`, em `/opt/simvio`). **Nunca compile na VPS.** Porta local: 8290.
> Vhost do Nginx central: `deploy/nginx/simvio.com.br.conf`. Segredos e variáveis ficam no repositório do GitHub;
> a cópia em `/opt/simvio/.env` é regravada a cada deploy. **Guarde `SIMVIO_ENCRYPTION_KEYS` e `SIMVIO_HMAC_KEY`
> em local seguro**: sem elas, os dados cifrados não podem ser lidos. Voltar versão: Actions → rodar de novo o
> workflow do commit desejado. Os passos abaixo com `--build` valem só para instalação local; nela, acrescente
> `-f compose.build.yaml` aos comandos.

Guia para instalar, atualizar, voltar versão e fazer backup da Simvio numa VPS Linux que **já hospeda
outras aplicações**. Nada aqui foi executado em VPS: os passos foram escritos e os scripts testados
localmente (ver `docs/STATUS.md`). Não altere a VPS sem autorização do responsável.

## Como fica a instalação

```
Internet ──HTTPS──> Nginx central da VPS (já existente, :443)
                      └─ vhost simvio.seudominio → http://127.0.0.1:${SIMVIO_PORT}
                                                   │
                     ┌─────────── projeto Compose "simvio" ───────────┐
                     │ nginx (única porta publicada, só em 127.0.0.1)  │
                     │   /      → web:3000   (painel e página pública) │
                     │   /api/  → api:3001   (remove só o prefixo /api)│
                     │ worker  (expiração, webhooks, limpeza)          │
                     │ db      (PostgreSQL, rede interna, sem porta)   │
                     └────────────────────────────────────────────────┘
```

- Portas 3000, 3001 e 5432 **não** são publicadas. Só o `nginx` da Simvio, em `SIMVIO_BIND_ADDRESS:SIMVIO_PORT`.
- Sem PM2: os processos são containers com `restart: unless-stopped` e healthcheck.
- O nome do projeto (`COMPOSE_PROJECT_NAME=simvio`) isola containers, redes e volume do banco das outras aplicações.

## Requisitos

- Docker Engine 24+ com o plugin `docker compose` (v2).
- Nginx central (ou outro proxy) com certificado HTTPS para o domínio da Simvio.
- Um domínio/subdomínio apontando para a VPS (ex.: `simvio.seudominio.com.br`).
- SMTP de um provedor real (confirmação de e-mail e recuperação de senha).
- ~1 GB de RAM livre e alguns GB de disco para banco e backups.

## 1. Primeira instalação

```bash
# 1) Código (pasta própria; não misture com outras aplicações)
sudo mkdir -p /opt/simvio && sudo chown "$USER" /opt/simvio
git clone <repositorio> /opt/simvio && cd /opt/simvio
git checkout <tag-da-versao>          # ex.: v1.0.0 — sempre implante uma versão marcada

# 2) Configuração
cp .env.example .env && chmod 600 .env
```

Preencha o `.env`:

| Variável | O que colocar |
|---|---|
| `SIMVIO_PORT` | Porta local livre na VPS (padrão 8080). Confira com `ss -ltnp \| grep :8080`. |
| `SIMVIO_BIND_ADDRESS` | `127.0.0.1` (só o Nginx central acessa). |
| `SIMVIO_TRUSTED_PROXIES` | Origem do Nginx central vista pelo container. Com o proxy no host, o padrão `172.16.0.0/12` (ponte do Docker) funciona. |
| `PUBLIC_BASE_URL` | `https://simvio.seudominio.com.br` (sem barra final). |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` (só letras e números). |
| `SIMVIO_ENCRYPTION_KEYS` | `k1:` + `openssl rand -base64 32`. |
| `SIMVIO_HMAC_KEY` | `openssl rand -base64 32`. **Não troque depois** sem migração. |
| `VELOMAIL_API_KEY` (ou `SMTP_URL`), `MAIL_FROM` | Provedor de e-mail. Em produção: VeloMail, com o domínio simvio.com.br verificado. |
| `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` | Cobrança pelo Asaas. No `.env`, a chave vai entre aspas simples (`ASAAS_API_KEY='$aact_...'`): sem elas o Compose lê o `$` como variável. Sem a chave, a assinatura é só manual pela administração. |
| `WEBHOOK_ALLOW_PRIVATE_TARGETS` | Mantenha `false` (a API se recusa a subir com `true` em produção). |

Guarde **fora da VPS** (cofre de senhas) uma cópia de `SIMVIO_ENCRYPTION_KEYS`, `SIMVIO_HMAC_KEY` e
`POSTGRES_PASSWORD`. Sem as chaves, um backup do banco não serve: telefones e segredos ficam ilegíveis.

```bash
# 3) Subir (constrói imagens, aplica migrações via serviço "migrate" e inicia)
docker compose up -d --build
docker compose ps                        # todos "healthy"; migrate "exited (0)"
curl -fsS http://127.0.0.1:${SIMVIO_PORT:-8080}/api/readyz   # {"status":"ready"}
```

### Vhost no Nginx central

Use `deploy/nginx/exemplo-vhost-central.conf` como base, num **arquivo novo** — não edite os vhosts
das outras aplicações:

```bash
sudo cp deploy/nginx/exemplo-vhost-central.conf /etc/nginx/sites-available/simvio.conf
sudo nano /etc/nginx/sites-available/simvio.conf      # domínio, certificado e porta = SIMVIO_PORT
sudo ln -s /etc/nginx/sites-available/simvio.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx          # só recarregue se o teste passar
```

Certificado: use o mesmo método já adotado na VPS (ex.: `certbot certonly --webroot` ou `--nginx`
limitado ao domínio da Simvio).

### Primeiro acesso

```bash
# Superadmin (administração da plataforma). A senha aparece UMA vez.
docker compose run --rm api node dist/scripts/bootstrap.js --email admin@seudominio.com.br --name "Seu nome" --super-admin
```

Entre em `https://simvio.seudominio.com.br/entrar`, troque a senha em **Configurações** e crie as
organizações dos clientes pelo cadastro normal ou pela administração. Para promover uma conta já
existente, rode o mesmo comando com o e-mail dela.

#### Autenticador (TOTP) do superadmin — obrigatório

A área `/admin` só abre depois de configurar um aplicativo autenticador (Google Authenticator,
Microsoft Authenticator, 1Password etc.):

1. Abra `https://simvio.seudominio.com.br/admin` e clique em **Começar**.
2. Leia o QR code no aplicativo (ou digite a chave mostrada) e informe o código de 6 números.
3. Guarde os **10 códigos de recuperação** num cofre fora da VPS. Cada um funciona uma vez e eles
   não são mostrados de novo.

Depois disso, cada sessão pede o código do aplicativo e a confirmação vale por 12 horas. Confira
que o relógio da VPS está sincronizado (`timedatectl` → `System clock synchronized: yes`); um
relógio adiantado ou atrasado mais de 30 s faz os códigos serem recusados.

Se o superadmin perder o celular **e** os códigos de recuperação, remova o autenticador pelo banco
(a ação fica sem auditoria da aplicação; registre-a por fora) e configure de novo:

```bash
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
UPDATE "User" SET "totpSecretEnc" = NULL, "totpEnabledAt" = NULL, "totpLastStep" = NULL, "totpRecoveryDigests" = '{}'
WHERE email = 'admin@seudominio.com.br';
SQL
```

### Conferências

- `https://simvio.seudominio.com.br/` abre o site; `/api/healthz` responde `{"status":"ok"}`.
- `ss -ltnp` mostra a porta da Simvio só em `127.0.0.1`; nada em 3000, 3001 ou 5432 pela Simvio.
- `docker compose logs api | grep -E 'sk_(test|live)_|whsec_|smv_dev_'` não retorna nada.
- Pareie um Android receptor e faça uma verificação real (ver `docs/PROVA_TECNICA.md`).

### Conferência pós-implantação (`scripts/smoke.mjs`)

Script em Node 22, sem dependências, que confere a instalação **só pela URL pública** (passa pelo
Nginx). Rode de qualquer máquina com Node 22 — não precisa estar na VPS.

```bash
# Básico: não cria nada. Confere /api/healthz, /api/readyz, painel em / /v/ /app,
# cabeçalhos de segurança (CSP, nosniff, anti-iframe, no-referrer e no-store em /v/) e 401 sem sessão/chave.
node scripts/smoke.mjs https://simvio.seudominio.com.br
```

Modo completo (`--full`) — **só em ambiente de teste ou com um tenant de teste**: consome um código
de pareamento, cria um aparelho simulado por HTTP (desconectado no fim), confirma uma linha e faz uma
verificação de teste: remetente errado recusado, remetente certo em formato nacional verificado,
evento repetido tratado como duplicado e consulta pela API como `verified`. Segredos vêm de
variáveis de ambiente e nunca são impressos.

```bash
# Tenant de teste (a chave e o código aparecem UMA vez; copie para as variáveis abaixo)
docker compose exec -T api node dist/scripts/bootstrap.js --email smoke@seudominio.com.br --name Smoke --org "Smoke" --app "Smoke"
export SIMVIO_API_KEY=sk_test_...        # "Chave de API (teste)"
export SIMVIO_PAIRING_CODE=XXXX-XXXX-XXXX  # "Código" (vale 5 minutos)
node scripts/smoke.mjs https://simvio.seudominio.com.br --full
```

Webhook (opcional): com `SMOKE_WEBHOOK_PORT` e `SMOKE_WEBHOOK_SECRET`, o script sobe um receptor local
e confere a assinatura `v1` do aviso `verification.verified`, o evento e o carimbo de tempo. O endpoint
precisa estar cadastrado com uma URL **HTTPS pública** que chegue a esse receptor (em produção a API
recusa destinos internos — proteção SSRF). Saída `0` = tudo certo; `1` = alguma falha (listada).

Para não deixar dados de teste, use uma organização própria para o smoke e suspenda-a na Administração
depois (ou rode antes de abrir para clientes).

Observação: no Docker Compose 5.x do Windows, `docker compose up --build` pode pedir
`--allow=fs.read=...` (bake do buildx). Contorno: `docker build -f apps/api/Dockerfile -t ghcr.io/fernandinhomartins40/simvio-api:latest .`,
`docker build -f apps/web/Dockerfile -t ghcr.io/fernandinhomartins40/simvio-web:latest .` e depois `docker compose up -d --no-build`.

## 2. Atualização

```bash
cd /opt/simvio
./scripts/backup.sh                         # SEMPRE antes de atualizar (ver seção 4)
git fetch --tags && git checkout <nova-tag>
docker compose build                         # constrói sem derrubar a versão atual
docker compose up -d                         # migrate roda antes de api/worker subirem
docker compose ps && curl -fsS http://127.0.0.1:${SIMVIO_PORT:-8080}/api/readyz
```

Se `migrate` falhar, `api` e `worker` não sobem com a nova versão: veja `docker compose logs migrate`.

As migrações do Prisma são só "para frente". Por isso cada versão deve manter compatibilidade com o
banco da versão anterior sempre que possível (adicionar colunas antes de usá-las; remover só na versão seguinte).

## 3. Voltar versão (rollback)

**Sem migração nova na versão com problema** (caso comum):

```bash
git checkout <tag-anterior>
docker compose up -d --build
```

**Com migração que quebrou compatibilidade:** restaure o backup feito antes da atualização num banco
novo (seção 5), aponte para ele e suba a versão anterior. Eventos ocorridos entre o backup e o
rollback se perdem — avise os clientes afetados.

## 4. Backup

`scripts/backup.sh` gera `pg_dump` (formato custom) criptografado com AES-256 (PBKDF2, 200 mil
iterações), grava o checksum SHA-256, confere que o arquivo é legível pelo `pg_restore` e apaga os
mais antigos que `BACKUP_RETENTION_DAYS` (padrão 14).

```bash
# Senha do backup, FORA do repositório, e uma cópia num cofre fora da VPS
sudo install -m 600 /dev/null /root/.simvio-backup-pass
openssl rand -base64 48 | sudo tee /root/.simvio-backup-pass >/dev/null

sudo BACKUP_PASSPHRASE_FILE=/root/.simvio-backup-pass BACKUP_DIR=/var/backups/simvio ./scripts/backup.sh
```

Agendamento diário (cron do root), às 3h10:

```
10 3 * * * cd /opt/simvio && BACKUP_PASSPHRASE_FILE=/root/.simvio-backup-pass ./scripts/backup.sh >> /var/log/simvio-backup.log 2>&1
```

Copie `/var/backups/simvio` para fora da VPS (outro servidor, armazenamento de objetos). Backup só
na mesma máquina não protege contra perda do disco.

## 5. Restaurar backup

`scripts/restore.sh` **nunca sobrescreve** um banco existente: restaura num banco novo, confere o
checksum e verifica migrações e tabelas.

```bash
sudo BACKUP_PASSPHRASE_FILE=/root/.simvio-backup-pass ./scripts/restore.sh /var/backups/simvio/simvio-AAAAMMDD-HHMMSS.dump.enc simvio_restaurado
```

Para colocar o banco restaurado em uso:

```bash
docker compose stop api worker                   # para de gravar no banco atual
docker compose exec db psql -U simvio -d postgres -c 'ALTER DATABASE simvio RENAME TO simvio_antigo_AAAAMMDD;'
docker compose exec db psql -U simvio -d postgres -c 'ALTER DATABASE simvio_restaurado RENAME TO simvio;'
docker compose up -d
```

Mantenha `simvio_antigo_…` até confirmar que está tudo certo; depois `DROP DATABASE`.

**Teste de restauração periódico** (mensal), sem tocar no banco em uso:

```bash
sudo RESTORE_DROP_AFTER=1 BACKUP_PASSPHRASE_FILE=/root/.simvio-backup-pass \
  ./scripts/restore.sh "$(ls -t /var/backups/simvio/*.dump.enc | head -1)" simvio_restore_test
```

## 6. Checklist de segurança

- [ ] `.env` com `chmod 600`, fora do Git; chaves com cópia em cofre fora da VPS.
- [ ] `SIMVIO_BIND_ADDRESS=127.0.0.1`; firewall da VPS libera só 22/80/443.
- [ ] HTTPS no Nginx central, com HSTS; HTTP redireciona para HTTPS.
- [ ] Logs do proxy central sem caminho completo de `/v/<token>` (o exemplo usa `access_log off`).
- [ ] `WEBHOOK_ALLOW_PRIVATE_TARGETS=false`.
- [ ] SMTP real configurado (sem ele não há confirmação de e-mail nem recuperação de senha).
- [ ] Superadmin com senha trocada no primeiro acesso e autenticador (TOTP) configurado; códigos de recuperação em cofre; nenhuma conta de teste em produção.
- [ ] Relógio da VPS sincronizado (NTP), necessário para o TOTP.
- [ ] Backup diário funcionando, cópia fora da VPS e teste de restauração mensal.
- [ ] `docker compose logs` sem chaves, tokens ou telefones completos.
- [ ] Imagens atualizadas periodicamente (`docker compose pull db nginx` + `up -d --build`).
- [ ] APK do receptor de produção assinado com chave guardada fora do repositório (`docs/ANDROID.md`).

## Desinstalar

```bash
docker compose down            # mantém o volume do banco
docker compose down -v         # APAGA o banco — só com backup conferido
sudo rm /etc/nginx/sites-enabled/simvio.conf && sudo nginx -t && sudo systemctl reload nginx
```
