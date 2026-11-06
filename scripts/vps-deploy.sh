#!/usr/bin/env bash
# Implantação na VPS, executada pelo GitHub Actions (.github/workflows/deploy.yml). Nunca compila aqui.
# Entrada: RELEASE (SHA do commit), IMAGE_PREFIX (ex.: ghcr.io/dono/simvio-), GHCR_USER; token do GHCR pela stdin.
set -euo pipefail

cd "$(dirname "$0")"
: "${RELEASE:?}" "${IMAGE_PREFIX:?}" "${GHCR_USER:?}"
GHCR_TOKEN=$(cat)
PORT=$(grep -E '^SIMVIO_PORT=' .env | cut -d= -f2-)
: "${PORT:?defina SIMVIO_PORT no .env}"

# Credencial própria do projeto: não mexe no login Docker de outras aplicações da VPS.
export DOCKER_CONFIG="$PWD/.docker"
mkdir -p "$DOCKER_CONFIG"
trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
if docker compose version >/dev/null 2>&1; then DC=(docker compose); else DC=(docker-compose); fi

# Porta ocupada por outra aplicação: para antes de derrubar qualquer coisa.
if ss -ltn "sport = :$PORT" | grep -q LISTEN && [ -z "$("${DC[@]}" ps -q nginx 2>/dev/null)" ]; then
  echo "ERRO: a porta $PORT já está em uso por outra aplicação. Troque a variável SIMVIO_PORT." >&2
  exit 1
fi

PREVIOUS=$(cat .release 2>/dev/null || true)
echo "Release anterior: ${PREVIOUS:-<nenhuma>}; nova: $RELEASE"

printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null

# A conexão com o registro às vezes cai; camadas já baixadas são aproveitadas na tentativa seguinte.
export RELEASE
for attempt in 1 2 3 4 5; do
  "${DC[@]}" pull --quiet && break
  [ "$attempt" = 5 ] && { echo "ERRO: não foi possível baixar as imagens." >&2; exit 1; }
  echo "Download falhou (tentativa $attempt de 5); nova tentativa em 20 s."
  sleep 20
done

healthy() {
  for _ in $(seq 1 36); do
    curl -fsS --max-time 4 "http://127.0.0.1:$PORT/api/readyz" >/dev/null 2>&1 && return 0
    sleep 5
  done
  return 1
}

"${DC[@]}" up -d --remove-orphans
if ! healthy; then
  echo "ERRO: a nova versão não ficou saudável." >&2
  "${DC[@]}" ps
  "${DC[@]}" logs --tail=40 api worker migrate || true
  # Migrações são só para frente: a versão anterior precisa continuar compatível com o banco.
  if [ -n "$PREVIOUS" ]; then
    echo "Voltando para a release $PREVIOUS."
    RELEASE="$PREVIOUS" "${DC[@]}" up -d --remove-orphans
  fi
  exit 1
fi
echo "$RELEASE" > .release

# Mantém só a release atual e a anterior deste projeto (VPS compartilhada: nunca usar prune -a).
docker images --format '{{.Repository}}:{{.Tag}}' \
  | grep "^${IMAGE_PREFIX}" \
  | grep -v -E ":(${RELEASE}${PREVIOUS:+|$PREVIOUS})$" \
  | xargs -r docker rmi >/dev/null 2>&1 || true

echo "Implantação concluída (RELEASE=$RELEASE)."
