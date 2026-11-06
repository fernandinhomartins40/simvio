# syntax=docker/dockerfile:1
# Painel e página pública (estático). Build a partir da raiz:  docker build -f apps/web/Dockerfile .

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY examples/node/package.json examples/node/
RUN npm ci --workspace=@simvio/web --workspace=@simvio/contracts --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN npm run build --workspace=@simvio/contracts \
 && npm run build --workspace=@simvio/web

# Servidor estático sem privilégios, escutando só na rede interna (3000).
FROM nginxinc/nginx-unprivileged:1.28-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 3000
