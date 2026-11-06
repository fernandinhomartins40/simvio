#!/usr/bin/env bash
# Restaura um backup da Simvio num banco NOVO (nunca sobrescreve um banco existente).
#
#   BACKUP_PASSPHRASE_FILE=/root/.simvio-backup-pass ./scripts/restore.sh /var/backups/simvio/simvio-....dump.enc [banco_destino]
#
# Passos: confere o checksum, cria o banco destino (padrão simvio_restore_AAAAMMDDHHMMSS), restaura,
# e verifica: migrações do Prisma aplicadas, tabelas principais presentes e contagem de linhas.
# Para colocar o banco restaurado em uso, siga docs/DEPLOY.md ("Restaurar backup").
#
# Opções (variáveis):
#   RESTORE_DROP_AFTER=1  apaga o banco destino ao final (teste periódico de restauração)
#   COMPOSE, DB_SERVICE   como em backup.sh
set -Eeuo pipefail
umask 077

file="${1:-}"
target="${2:-simvio_restore_$(date -u +%Y%m%d%H%M%S)}"
PASS_FILE="${BACKUP_PASSPHRASE_FILE:-}"
read -r -a COMPOSE_CMD <<<"${COMPOSE:-docker compose}"
DB_SERVICE="${DB_SERVICE:-db}"
CIPHER=(-aes-256-cbc -pbkdf2 -iter 200000 -md sha256)

log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >&2; }
die() { log "ERRO: $*"; exit 1; }

[[ -n "$file" && -r "$file" ]] || die "uso: restore.sh <arquivo.dump.enc> [banco_destino]"
[[ -n "$PASS_FILE" && -r "$PASS_FILE" ]] || die "defina BACKUP_PASSPHRASE_FILE"
[[ "$target" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || die "nome de banco inválido: $target"

dbx() { "${COMPOSE_CMD[@]}" exec -T "$DB_SERVICE" "$@"; }
# psql no banco de manutenção com o usuário do container.
psql_admin() { dbx sh -c 'exec psql -v ON_ERROR_STOP=1 -X -qAt -U "$POSTGRES_USER" -d postgres' ; }
psql_target() { dbx sh -c "exec psql -v ON_ERROR_STOP=1 -X -qAt -U \"\$POSTGRES_USER\" -d $target" ; }

if [[ -r "$file.sha256" ]]; then
  ( cd "$(dirname "$file")" && sha256sum -c --quiet "$(basename "$file").sha256" ) || die "checksum não confere"
  log "checksum ok"
else
  log "aviso: $file.sha256 não encontrado; seguindo sem conferir checksum"
fi

exists="$(echo "SELECT 1 FROM pg_database WHERE datname = '$target';" | psql_admin)"
[[ -z "$exists" ]] || die "o banco $target já existe; escolha outro nome (este script não sobrescreve)"

created=0
cleanup() {
  if [[ "${RESTORE_DROP_AFTER:-0}" == 1 && $created == 1 ]]; then
    echo "DROP DATABASE IF EXISTS \"$target\" WITH (FORCE);" | psql_admin && log "banco $target removido"
  fi
}
trap cleanup EXIT

echo "CREATE DATABASE \"$target\";" | psql_admin
created=1
log "restaurando em $target"

openssl enc -d "${CIPHER[@]}" -pass "file:$PASS_FILE" -in "$file" \
  | dbx sh -c "exec pg_restore -U \"\$POSTGRES_USER\" -d $target --no-owner --exit-on-error"

# Verificação do conteúdo restaurado.
migrations="$(echo 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;' | psql_target)"
(( migrations > 0 )) || die "nenhuma migração aplicada encontrada no banco restaurado"
for t in Organization User Application Device Verification OutboxEvent WebhookDelivery AuditLog; do
  echo "SELECT 1 FROM \"$t\" LIMIT 1;" | psql_target >/dev/null || die "tabela $t ausente"
done
log "migrações aplicadas: $migrations"
echo "SELECT 'organizacoes=' || (SELECT count(*) FROM \"Organization\")
          || ' usuarios=' || (SELECT count(*) FROM \"User\")
          || ' aparelhos=' || (SELECT count(*) FROM \"Device\")
          || ' verificacoes=' || (SELECT count(*) FROM \"Verification\");" | psql_target >&2
log "restauração verificada em $target"
