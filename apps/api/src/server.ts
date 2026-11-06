import { buildApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { ensureDefaultPlans } from "./modules/plans.js";

const app = await buildApp();
await ensureDefaultPlans();

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "encerrando API");
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: "0.0.0.0", port: config.API_PORT });
