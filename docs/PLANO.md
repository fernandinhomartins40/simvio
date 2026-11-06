# Plano de implementação — Simvio

Fonte de verdade: `SIMVIO_PRD.md` (v1.1) → `04_DOCUMENTACAO/` → imagens de referência.
Estado detalhado e evidências ficam em `docs/STATUS.md`.

## Ponto de partida

Repositório sem código (somente PRD, marca, referências visuais e assets). Ambiente local:
Node 24, npm 11, Docker Desktop, JDK 17, Android SDK (plataformas 35–37), Gradle em cache, PHP 8.3.
Nenhum aparelho Android conectado: recepção de SMS real fica como validação externa pendente.

## Decisões de arquitetura

- Monorepo npm workspaces + Turborepo.
  - `apps/api`: Fastify + Prisma + PostgreSQL. Contém dois pontos de entrada do mesmo código:
    `server` (HTTP, porta 3001) e `worker` (outbox, webhooks, expiração). O worker do Compose usa a
    mesma imagem com outro comando — por isso não existe `apps/worker` separado.
  - `apps/web`: React + Vite + TypeScript + Tailwind + componentes no padrão shadcn/ui + Lucide.
    Painel, landing, documentação e página pública de verificação (`/v/:token`). Servido em produção
    por Nginx interno na porta 3000 com fallback SPA.
  - `apps/android`: Kotlin + Jetpack Compose (Gradle próprio, fora do npm).
  - `packages/contracts`: validação de telefone E.164 (BR), formato do desafio e tipos compartilhados.
  - `examples/node` e `examples/laravel`: integração de backend real.
  - `infra/`: Nginx de entrada, vhost HTTPS de exemplo, scripts de backup/restauração.
- Versões em linhas estáveis conhecidas: TypeScript 5.9, Prisma 6.19, Fastify 5, Zod 4, Vite 7,
  React 19, React Router 7, Tailwind 4, Vitest 3.
- PostgreSQL é persistência e fila (outbox com `FOR UPDATE SKIP LOCKED`); sem Redis.
- Segredos: chaves de API, credenciais de aparelho, tokens públicos e desafios guardados por digest;
  envelope de criação e segredos de webhook cifrados com AES-256-GCM (chave mestra no ambiente).
  Senhas com scrypt (nativo do Node, sem dependência nativa).
- Desafio: 128 bits aleatórios em Base32 (26 caracteres) → `SIMVIO <token>`; prazo de 5 min.

## Etapas

0. **Prova técnica do núcleo** — schema completo, motor de verificação (criar/consultar/cancelar),
   pareamento, linha receptora com teste de recebimento, eventos e heartbeat do aparelho, página
   pública mínima, app Android receptor, script de bootstrap para testar sem painel, testes
   automatizados dos casos críticos e guia de teste com SMS real.
1. **Base SaaS** — cadastro/login/recuperação, organizações, papéis, aplicações, ambientes, chaves,
   pareamento pelo painel, painel (início, aplicações, aparelhos, verificações), exemplos de
   integração, OpenAPI.
2. **Confiabilidade** — outbox transacional, webhooks assinados com retries e reentrega, SSRF,
   revogação, expiração pelo worker, diagnóstico, rate limits, retenção/expurgo.
3. **Piloto** — planos manuais e auditoria, equipe, superadmin com TOTP, Docker Compose + Nginx,
   vhost de exemplo, backup/restauração testados, guia de deploy.

## Fora do escopo (PRD §4)

iOS, WhatsApp/RCS, envio de SMS, checkout recorrente, KYC, login social, microsserviços, Kubernetes.
