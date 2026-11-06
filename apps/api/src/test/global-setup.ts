import { execSync } from "node:child_process";

/**
 * Aplica as migrações reais no banco de teste dedicado (não destrutivo).
 * Cada teste limpa as tabelas com TRUNCATE (ver helpers.resetDb) — somente neste banco.
 */
export default function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? "postgresql://simvio:simvio_dev_only@127.0.0.1:15432/simvio_test?schema=public";
  if (!/simvio_test|_test\b/.test(url)) throw new Error("TEST_DATABASE_URL precisa apontar para um banco de teste (*_test).");
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
}
