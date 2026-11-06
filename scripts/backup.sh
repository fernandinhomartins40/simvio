#!/usr/bin/env bash
# Backup criptografado do PostgreSQL da Simvio (rodar na VPS, na pasta do projeto).
#
#   BACKUP_PASSPHRASE_FILE=/root/.simvio-backup-pass ./scripts/backup.sh
#
# Gera em $BACKUP_DIR:
#   simvio-AAAAMMDD-HHMMSS.dump.enc         pg_dump formato custom, criptografado (AES-256, PBKDF2)
#   simvio-AAAAMMDD-HHMMSS.dump.enc.sha256  checksum do arquivo criptografado
# Depois confere que o backup decifra e é legível pelo pg_restore, e apaga os mais antigos que
# BACKUP_RETENTION_DAYS. A senha fica num arquivo FORA do repositório (chmod 600). Guarde uma
# cópia dela fora da VPS: sem ela o backup é irrecuperável.
#
# Variáveis:
#   BACKUP_PASSPHRASE_FILE  obrigatório; arquivo com a senha (uma linha, 32+ caracteres)
#   BACKUP_DIR              padrão /var/backups/simvio
#   BACKUP_RETENTION_DAYS   padrão 14
#   COMPOSE                 comando compose (padrão "docker compose")
#   DB_SERVICE              serviço do banco (padrão db)
set -Eeuo pipefail
umask 077

BACKUP_DIR="${BACKUP_DIR:-/var/backups/simvio}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
PASS_FILE="${BACKUP_PASSPHRASE_FILE:-}"
read -r -a COMPOSE_CMD <<<"${COMPOSE:-docker compose}"
DB_SERVICE="${DB_SERVICE:-db}"
CIPHER=(-aes-256-cbc -pbkdf2 -iter 200000 -md sha256)

log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >&2; }
die() { log "ERRO: $*"; exit 1; }

[[ -n "$PASS_FILE" ]] || die "defina BACKUP_PASSPHRASE_FILE (arquivo com a senha, fora do repositório)"
[[ -r "$PASS_FILE" ]] || die "não consigo ler $PASS_FILE"
(( $(head -n1 "$PASS_FILE" | tr -d '\r\n' | wc -c) >= 32 )) || die "a senha em $PASS_FILE precisa ter 32+ caracteres"
[[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || die "BACKUP_RETENTION_DAYS inválido"
command -v openssl >/dev/null || die "openssl não encontrado"

mkdir -p "$BACKUP_DIR"

# Evita dois backups simultâneos (cron + manual).
if command -v flock >/dev/null; then
  exec 9>"$BACKUP_DIR/.lock"
  flock -n 9 || die "outro backup em andamento"
fi

stamp="$(date -u +%Y%m%d-%H%M%S)"
name="simvio-$stamp.dump.enc"
tmp="$BACKUP_DIR/.$name.partial"
trap 'rm -f "$tmp"' EXIT

log "gerando backup $name"
# Usuário e banco vêm do ambiente do próprio container (nada de senha na linha de comando).
"${COMPOSE_CMD[@]}" exec -T "$DB_SERVICE" sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z 6 --no-owner' \
  | openssl enc -e "${CIPHER[@]}" -salt -pass "file:$PASS_FILE" -out "$tmp"

[[ -s "$tmp" ]] || die "backup vazio"

# Verificação: decifra e pede ao pg_restore o índice do arquivo (sem tocar em nenhum banco).
entries="$(openssl enc -d "${CIPHER[@]}" -pass "file:$PASS_FILE" -in "$tmp" \
  | "${COMPOSE_CMD[@]}" exec -T "$DB_SERVICE" pg_restore --list | grep -c ' TABLE DATA ' || true)"
(( entries > 0 )) || die "backup gerado não pôde ser lido pelo pg_restore"

mv "$tmp" "$BACKUP_DIR/$name"
( cd "$BACKUP_DIR" && sha256sum "$name" >"$name.sha256" )
trap - EXIT
log "ok: $BACKUP_DIR/$name ($(du -h "$BACKUP_DIR/$name" | cut -f1), $entries tabelas com dados)"

# Retenção: só arquivos deste script, mais antigos que N dias. Sempre mantém o mais recente.
if (( RETENTION_DAYS > 0 )); then
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'simvio-*.dump.enc' -mtime +"$RETENTION_DAYS" ! -name "$name" -print \
    | while read -r old; do
        rm -f "$old" "$old.sha256"
        log "removido (retenção): $(basename "$old")"
      done
fi
