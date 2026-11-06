# Status da implementação — Simvio

Última atualização: 03/11/2026. Plano: `docs/PLANO.md`. Legenda:
**Implementado** (código existe) · **Compilado** · **Testado automaticamente** · **Validado com SMS real**.

## Resumo

| Etapa | Situação |
|---|---|
| 0/1 — Prova técnica do núcleo | Servidor, app Android e integração implementados, compilados e testados. E2E local com aparelho **simulado por HTTP**. **SMS real: pendente** (sem aparelho físico). |
| 1 — Base SaaS | API do painel pronta e testada (contas, sessões, organizações isoladas, papéis, aplicações, chaves, webhooks, aparelhos, pareamento, verificações, equipe/convites, assinatura, auditoria). Telas do painel web: **entregues** (typecheck + build; conferidas por captura com dados reais da API local). |
| 2 — Confiabilidade | Outbox, webhooks assinados, retries, reentrega, SSRF, revogação, expiração atômica, dedupe, retenção: implementados e testados (retenção sem teste dedicado). Diagnóstico do aparelho exibido no painel. |
| 3 — Piloto | OpenAPI, exemplos Node e PHP/Laravel, backup/restore, guias de implantação e operação: **entregues**. Docker Compose + Nginx + Dockerfiles: **entregues e testados com Docker** (projeto isolado; HTTPS real e VPS pendentes). Administração (superadmin com TOTP, planos manuais, suspensão, revogação, auditoria global): **implementada e testada**. |

## Detalhe

| Item | Impl. | Comp. | Teste auto | SMS real |
|---|---|---|---|---|
| Schema Prisma (PRD §12) + 4 migrações, CHECKs e índice parcial de número ativo único | ✅ | ✅ | ✅ | — |
| Motor: criar/consultar/cancelar, idempotência, expiração sob demanda, nova sessão invalida anterior | ✅ | ✅ | ✅ | ⏳ |
| Desafio 128 bits Base32 só como digest; envelope cifrado apagado no estado final | ✅ | ✅ | ✅ | — |
| Pareamento código/QR (5 min, uso único), credencial do aparelho por digest | ✅ | ✅ | ✅ | ⏳ |
| Linha receptora com teste de recebimento; troca de chip exige revalidação; dual SIM seguro | ✅ | ✅ | ✅ | ⏳ |
| Eventos do aparelho: validação completa, dedupe, concorrência (1 aprovação) | ✅ | ✅ | ✅ | ⏳ |
| Revogação de aparelho (painel/app) | ✅ | ✅ | ✅ (servidor) | ⏳ (app) |
| Outbox + worker + webhooks HMAC + retries + reentrega; reinício do worker | ✅ | ✅ | ✅ | — |
| SSRF (HTTPS, IPs privados/metadados/IPv6, checagem na conexão, sem redirect) | ✅ | ✅ | ✅ | — |
| Retenção 7/30/90 dias no worker (+ procedimento de exclusão de organização em `docs/OPERACAO.md`) | ✅ | ✅ | ✅ `retention.test.ts` (telefone 7 d, histórico 30 d, auditoria 90 d, transitórios, pendente preservada) | — |
| Lacunas do PRD fechadas em 04/11: limite de criação por aplicação (120/min, além do por IP e por telefone); aparelho que informou permissão de SMS negada não recebe novas sessões e aparece em “precisa de atenção” no Início | ✅ | ✅ | ✅ 2 testes (`retention.test.ts`) | — |
| Autenticação do painel (cookie HttpOnly, CSRF, Origin, verificação de e-mail, recuperação, troca de senha) | ✅ | ✅ | ✅ | — |
| API do painel com isolamento por organização (404 para não membro) e papéis | ✅ | ✅ | ✅ | — |
| Superadmin: flag `--super-admin` no bootstrap (cria ou promove, com auditoria) | ✅ | ✅ typecheck | ❌ não executado | — |
| Administração `/v1/admin/*` + tela `/admin`: exige superadmin (outros recebem 404) + sessão + CSRF + TOTP RFC 6238 confirmado na sessão (vale 12 h; código não reutilizável; 10 códigos de recuperação por digest; segredo cifrado) | ✅ | ✅ typecheck + vite build | ✅ 8 testes (`admin.test.ts`, inclui vetor RFC 6238); conferida no navegador em 04/11 (cadastro do TOTP com QR, código errado recusado, código certo libera, lista, detalhe, auditoria, celular sem rolagem lateral) | — |
| Admin: listar/buscar organizações com plano e uso, detalhe, suspender/reativar (bloqueia verificações e pareamento; independente da cobrança), plano/situação/“pago até”/observação manuais, revogar aparelho de qualquer org, registro de ações global — tudo auditado | ✅ | ✅ | ✅ | — |
| Entregas de webhooks filtradas por ambiente (`?environment=`) no painel | ✅ | ✅ | ✅ | — |
| Telas do painel web (auth, início, aplicações, aparelhos com QR, verificações, avisos, equipe, assinatura, configurações, landing, documentação) | ✅ | ✅ typecheck + vite build + imagem Docker | ❌ sem testes automáticos de UI (conferidas por captura com API real) | — |
| Página pública `/v/:token` | ✅ | ✅ | ❌ (conferida visualmente por captura) | ⏳ |
| App Android (receiver, fila cifrada, WorkManager, heartbeat, telas; revisado em 04/11: sem permissão de notificações, aviso de revogação em segundo plano, teste de linha expirado, índice de SIM legado) | ✅ | ✅ debug 19,4 MB / release R8 sem assinatura 2,2 MB | ✅ 5 testes JVM; lint 0 erros (40 avisos de estilo) | ⏳ |
| OpenAPI 3.1 (`docs/openapi.yaml`) — integração, sessão pública, webhooks, erros reais | ✅ | ✅ `redocly lint` sem erros nem avisos | — | — |
| Exemplo Node.js | ✅ | — | ✅ 2 testes; usado no E2E | ⏳ |
| Exemplo PHP puro + Laravel (`examples/php`) | ✅ | ✅ `php -l` (PHP 8.3) | ✅ 14 checagens: assinatura idêntica aos vetores gerados pela API Node, rejeições | ❌ não rodado num projeto Laravel real |
| Backup/restore criptografado (`scripts/backup.sh`, `scripts/restore.sh`) | ✅ | ✅ | ✅ executado contra o banco de dev (ver abaixo) | — |
| Conferência pós-implantação `scripts/smoke.mjs` (básico + `--full` com aparelho simulado e conferência de assinatura do webhook) | ✅ | — | ✅ 04/11/2026: pilha `compose.yaml` isolada (porta 18090) — básico 13/13 e `--full` 18/18 pelo Nginx, logs sem segredos/telefones/tokens; webhook assinado conferido contra API dev (produção bloqueia destino local), caso negativo (segredo errado) acusa falha | ⏳ |
| Docker Compose de produção, Dockerfiles, Nginx de borda + vhost central de exemplo | ✅ | ✅ `docker compose config` + build das imagens | ✅ pilha isolada na porta 18080: healthz/readyz, SPA, 404/401, logs sem tokens, só uma porta publicada | ❌ HTTPS real/VPS não testados |
| Guias: `docs/DEPLOY.md`, `docs/OPERACAO.md`, `docs/PROVA_TECNICA.md`, `docs/ANDROID.md` | ✅ | — | — | — |

Testes da API: `npm test -w @simvio/api` → **56/56** (núcleo, webhooks, painel, administração, retenção; matriz PRD §16 inclusa).

### Backup/restore — teste local (03/11/2026)

Contra o container de desenvolvimento (`compose.dev.yaml`, base `simvio`):
backup de 68 KB com 22 tabelas com dados → checksum ok → restauração em `simvio_restore_test`
(2 migrações, 2 organizações, 2 usuários, 2 aparelhos, 4 verificações, iguais à origem) → banco
temporário removido. Casos de erro conferidos: banco destino existente (recusa), senha errada (falha
no pg_restore e limpeza), arquivo adulterado (checksum recusa), senha curta (recusa).
As bases `simvio` e `simvio_test` não foram alteradas. Não executado em VPS.

### E2E local (31/10/2026, aparelho simulado por HTTP)

Pareamento → linha verificada → cadastro no exemplo → página pública → remetente errado rejeitado →
SMS correto (formato nacional) verificado → webhook entregue → exemplo confirmou pela API e ativou uma
vez. Log da API sem tokens, credenciais ou telefones completos.

## Pendências externas (exigem você)

1. **SMS real**: seguir `docs/PROVA_TECNICA.md` com Android físico + chip e preencher a matriz de `docs/ANDROID.md`.
2. Comportamento em segundo plano por fabricante (medir).
3. Distribuição: declaração de permissão SMS no Google Play (aprovação não garantida); piloto via APK privado assinado — chave de assinatura a criar e guardar fora do repositório.
4. Domínio definitivo, SMTP de produção e autorização para implantar na VPS (`docs/DEPLOY.md`).

## Riscos/decisões registrados

- Prisma fixado em 6.19.3; `npm audit` aponta `deepmerge-ts` só na CLI do Prisma; correção exige Prisma 7.
- Android sem trabalho expedito/serviço em primeiro plano: reenvio após falha de rede não é imediato garantido.
- Worker e API compartilham imagem/código (`apps/api`, entradas `server` e `worker`).
- Backup usa `openssl enc` AES-256-CBC + PBKDF2 (sem autenticação no próprio arquivo); integridade
  conferida por SHA-256 separado e pela leitura do `pg_restore`.
