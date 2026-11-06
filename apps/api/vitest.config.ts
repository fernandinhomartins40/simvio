import { defineConfig } from "vitest/config";

// Testes de integração usam um PostgreSQL real (banco separado "simvio_test").
// Chaves abaixo são exclusivas de teste e não têm valor fora daqui.
const TEST_DB =
  process.env.TEST_DATABASE_URL ?? "postgresql://simvio:simvio_dev_only@127.0.0.1:15432/simvio_test?schema=public";

export default defineConfig({
  test: {
    globalSetup: ["./src/test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: TEST_DB,
      PUBLIC_BASE_URL: "https://simvio.test",
      SIMVIO_ENCRYPTION_KEYS: "k1:" + Buffer.alloc(32, 1).toString("base64"),
      SIMVIO_HMAC_KEY: Buffer.alloc(32, 2).toString("base64"),
      WEBHOOK_ALLOW_PRIVATE_TARGETS: "true",
      LOG_LEVEL: "silent",
    },
  },
});
