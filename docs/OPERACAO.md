# Operação do dia a dia

Comandos na pasta do projeto na VPS (`/opt/simvio`). Instalação e atualização: `docs/DEPLOY.md`.

## Estado

```bash
docker compose ps                                   # todos healthy? migrate exited (0)?
curl -fsS http://127.0.0.1:${SIMVIO_PORT:-8080}/api/readyz
docker compose logs --since 30m api worker          # logs não têm chaves, tokens nem telefones completos
docker stats --no-stream $(docker compose ps -q)    # memória/CPU
```

Logs dos containers giram sozinhos (10 MB × 5 por serviço).

## Problemas comuns

| Sintoma | O que olhar |
|---|---|
| Cliente recebe `receiver_unavailable` | Painel → Aparelhos: aparelho "Sem comunicação"? No Android: internet, economia de bateria, app aberto ao menos uma vez após reiniciar. A API só usa aparelhos com sinal dentro de `DEVICE_OFFLINE_AFTER_SECONDS` (padrão 60 min); o painel avisa "Sinal atrasado" a partir de 20 min. |
| Usuário enviou SMS e nada acontece | Painel → Verificações (status e motivo). "Confira a linha usada": SMS saiu de outro chip. Sem nenhum evento: o SMS não chegou ao receptor (saldo, chip, RCS/iMessage). |
| Webhook falhando | Painel → Avisos automáticos → entregas: código HTTP/erro de cada tentativa. `blocked:` = URL privada/proibida. Depois de corrigir, use "Reenviar". |
| Verificações não expiram / webhooks parados | `docker compose logs worker`; `docker compose restart worker`. Eventos ficam guardados no banco e saem quando o worker volta. |
| Erro 502 no domínio | `docker compose ps`; `nginx -t` no proxy central; porta do vhost = `SIMVIO_PORT`. |
| Disco cheio | `docker system df`; backups antigos em `/var/backups/simvio`; `docker image prune`. |

## Rotinas

- **Diária (cron):** `scripts/backup.sh` — ver `docs/DEPLOY.md`.
- **Automática (worker):** expira verificações vencidas, entrega e repete webhooks, limpa dados:
  telefone completo após 7 dias; verificações, eventos do aparelho e outbox após 30 dias; auditoria após 90 dias.
- **Mensal:** teste de restauração (`RESTORE_DROP_AFTER=1 scripts/restore.sh …`); revisar aparelhos
  sem comunicação e assinaturas suspensas; atualizar imagens.

## Ações de suporte

- **Aparelho perdido/roubado:** Painel → Aparelhos → Revogar. A credencial deixa de valer na hora e as
  verificações pendentes daquele receptor falham com `receiver_revoked`.
- **Chave de API vazada:** Painel → Aplicações → Chaves → Rotacionar (a antiga para na hora).
- **Segredo de webhook vazado:** Avisos automáticos → Rotacionar segredo; atualize no backend do cliente.
- **Superadmin novo:** `docker compose run --rm api node dist/scripts/bootstrap.js --email … --super-admin`.
- **Exclusão de uma organização (pedido do cliente):** não há botão; é ação manual e auditada.
  1. Suspenda a organização em Administração (para novas verificações e pareamentos).
  2. Registre o pedido (quem pediu, data) fora do sistema.
  3. `docker compose exec -T db psql -U simvio -d simvio -c "DELETE FROM \"Organization\" WHERE id = '<id>';"`
     — apaga em cascata aplicações, chaves, aparelhos, verificações, webhooks, membros e assinatura;
     a auditoria fica sem vínculo (`organizationId` nulo) e some pela retenção de 90 dias.
     Contas de usuário continuam existindo (podem pertencer a outras organizações).
  4. **Backups:** a organização continua nos backups anteriores até eles envelhecerem
     (`BACKUP_RETENTION_DAYS`, padrão 14 dias). Ao restaurar um backup antigo, repita a exclusão.
- **Rotação da chave de criptografia:** acrescente a nova à frente em `SIMVIO_ENCRYPTION_KEYS`
  (`k2:<nova>,k1:<antiga>`) e reinicie `api` e `worker`. Mantenha a antiga até os dados antigos expirarem pela retenção.

## Revogar a chave de um agente de IA (MCP)

O agente de IA acessa a Simvio por `/api/mcp` com uma chave `smv_agent_`. Se a chave vazar ou o computador for perdido:
**Agentes de IA → Revogar**, no painel da organização. A chave para de funcionar na próxima chamada. Toda ação do agente
fica no registro de atividades com o autor `agent_key`. Chaves de API criadas pelo agente continuam válidas: revise
em **Aplicações** e revogue as que não reconhecer.
