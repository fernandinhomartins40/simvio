# syntax=docker/dockerfile:1
# Imagem da API e do worker (mesmo código; o comando define o processo).
# Build a partir da raiz do monorepo:  docker build -f apps/api/Dockerfile .

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base
# openssl: detecção do engine do Prisma (debian-openssl-3.0.x); ca-certificates: webhooks HTTPS e SMTP TLS.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false

# --- dependências completas (build) ---
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY examples/node/package.json examples/node/
RUN npm ci --workspace=@simvio/api --workspace=@simvio/contracts --include-workspace-root

# --- compilação ---
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN npm run build --workspace=@simvio/contracts \
 && npm run build --workspace=@simvio/api

# --- dependências de produção ---
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY examples/node/package.json examples/node/
COPY apps/api/prisma apps/api/prisma
RUN npm ci --omit=dev --workspace=@simvio/api --workspace=@simvio/contracts \
 && npx --workspace=@simvio/api prisma generate \
 && npm cache clean --force

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production API_PORT=3001
COPY --from=prod-deps --chown=node:node /app/node_modules node_modules
COPY --from=prod-deps --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/packages/contracts/package.json packages/contracts/
COPY --from=build --chown=node:node /app/packages/contracts/dist packages/contracts/dist
COPY --from=build --chown=node:node /app/apps/api/package.json apps/api/
COPY --from=build --chown=node:node /app/apps/api/prisma apps/api/prisma
COPY --from=build --chown=node:node /app/apps/api/dist apps/api/dist
COPY --chown=node:node docs/openapi.yaml docs/guia-agente.md docs/
WORKDIR /app/apps/api
USER node
EXPOSE 3001
# Padrão: API. Worker: node dist/worker.js. Migrações: npx prisma migrate deploy.
CMD ["node", "dist/server.js"]
