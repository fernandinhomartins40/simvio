/**
 * Prova técnica (etapa 0): prepara um tenant para teste real sem depender do painel.
 *
 *   npm run bootstrap -w @simvio/api -- --email voce@exemplo.com --org "Minha empresa" [--webhook https://...]
 *   npm run bootstrap -w @simvio/api -- --pair --org-id <id>      # novo código de pareamento
 *   npm run bootstrap -w @simvio/api -- --email voce@exemplo.com --super-admin   # cria OU promove superadmin
 *   (na VPS: docker compose run --rm api node dist/scripts/bootstrap.js ...)
 *
 * Segredos (senha inicial, chave de API, segredo do webhook) são exibidos UMA vez no terminal.
 */
import { parseArgs } from "node:util";
import { prisma } from "../db.js";
import { encrypt, hashPassword, randomToken } from "../lib/crypto.js";
import { validateWebhookUrl } from "../lib/ssrf.js";
import { createApiKey } from "../modules/apikeys.js";
import { createPairing } from "../modules/devices/service.js";
import { ensureDefaultPlans } from "../modules/plans.js";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string", default: "Responsável" },
    org: { type: "string", default: "Organização de teste" },
    app: { type: "string", default: "Aplicação de teste" },
    webhook: { type: "string" },
    pair: { type: "boolean", default: false },
    "org-id": { type: "string" },
    "super-admin": { type: "boolean", default: false },
  },
});

async function main() {
  await ensureDefaultPlans();

  if (values.pair) {
    const orgId = values["org-id"];
    if (!orgId) throw new Error("Informe --org-id");
    const owner = await prisma.membership.findFirstOrThrow({ where: { organizationId: orgId, role: "owner" } });
    const p = await createPairing(orgId, owner.userId);
    console.log(`\nCódigo de pareamento: ${p.code}  (expira ${p.expires_at})\nAPI: ${p.api_base_url}\nQR: ${p.qr_payload}\n`);
    return;
  }

  if (!values.email) throw new Error("Informe --email");
  const email = values.email.toLowerCase();

  if (values["super-admin"]) {
    // Administração da plataforma: conta própria, sem organização. Promove se já existir.
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { isSuperAdmin: true } });
      await prisma.auditLog.create({ data: { actorType: "system", action: "user.super_admin_granted", targetType: "user", targetId: existing.id } });
      console.log(`
${email} agora é superadmin. Entre no painel com a senha atual.
`);
      return;
    }
    const pw = randomToken(12);
    const admin = await prisma.user.create({
      data: { email, name: values.name!, passwordHash: await hashPassword(pw), emailVerifiedAt: new Date(), isSuperAdmin: true },
    });
    await prisma.auditLog.create({ data: { actorType: "system", action: "user.super_admin_granted", targetType: "user", targetId: admin.id } });
    console.log(`
Superadmin criado. Guarde a senha: ela não será exibida de novo.

  Usuário  ${email}
  Senha    ${pw}

Troque a senha no primeiro acesso (Configurações).
`);
    return;
  }

  const password = randomToken(12);
  const user = await prisma.user.create({
    data: { email, name: values.name!, passwordHash: await hashPassword(password), emailVerifiedAt: new Date() },
  });
  const org = await prisma.organization.create({
    data: { name: values.org!, memberships: { create: { userId: user.id, role: "owner" } } },
  });
  const app = await prisma.application.create({
    data: { organizationId: org.id, name: values.app!, displayName: values.org! },
  });
  const { secret } = await createApiKey(org.id, app.id, "test", "Chave de teste (bootstrap)", user.id);

  let webhookSecret: string | null = null;
  if (values.webhook) {
    validateWebhookUrl(values.webhook);
    webhookSecret = `whsec_${randomToken(24)}`;
    await prisma.webhookEndpoint.create({
      data: { organizationId: org.id, applicationId: app.id, environment: "test", url: values.webhook, secretEnc: encrypt(webhookSecret) },
    });
  }
  const pairing = await createPairing(org.id, user.id);

  console.log(`
Tenant de teste criado. Guarde os segredos abaixo: eles não serão exibidos de novo.

  Usuário (painel)     ${user.email}
  Senha inicial        ${password}
  Organização          ${org.id}
  Aplicação            ${app.id}
  Chave de API (teste) ${secret}
${webhookSecret ? `  Segredo do webhook   ${webhookSecret}\n` : ""}
Pareie o Android receptor (código vale 5 minutos, uso único):
  API                  ${pairing.api_base_url}
  Código               ${pairing.code}
  Link/QR              ${pairing.qr_payload}

Novo código depois:  npm run bootstrap -w @simvio/api -- --pair --org-id ${org.id}
`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
