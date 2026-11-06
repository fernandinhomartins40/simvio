import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().default(3001),
  // Origem pública, sem barra final. Ex.: https://simvio.example.com
  PUBLIC_BASE_URL: z.string().url(),
  // Chaves AES-256-GCM: "k2:<base64 32 bytes>,k1:<base64>". A primeira cifra; todas decifram.
  SIMVIO_ENCRYPTION_KEYS: z.string().min(1),
  // Chave HMAC (base64, 32 bytes) para digests de baixa entropia (telefones).
  SIMVIO_HMAC_KEY: z.string().min(1),
  VERIFICATION_TTL_SECONDS: z.coerce.number().int().min(60).max(1800).default(300),
  IDEMPOTENCY_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(24),
  PAIRING_TTL_SECONDS: z.coerce.number().int().default(300),
  LINE_CHECK_TTL_SECONDS: z.coerce.number().int().default(900),
  // Aparelho sem comunicação há mais que isto não recebe novas sessões.
  DEVICE_OFFLINE_AFTER_SECONDS: z.coerce.number().int().default(3600),
  DEVICE_DEGRADED_AFTER_SECONDS: z.coerce.number().int().default(1200),
  // Somente desenvolvimento isolado: permite webhooks para http/localhost.
  WEBHOOK_ALLOW_PRIVATE_TARGETS: bool.default(false),
  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().default(10000),
  // Confia em X-Forwarded-* apenas do proxy da própria stack (Nginx da Simvio).
  TRUST_PROXY: z.string().default("loopback,uniquelocal"),
  SMTP_URL: z.string().optional(),
  // VeloMail (e-mail transacional em produção). Com a chave, tem prioridade sobre o SMTP.
  VELOMAIL_API_KEY: z.string().optional(),
  VELOMAIL_API_URL: z.url().default("https://www.velomail.com.br/api"),
  MAIL_FROM: z.string().default("Simvio <nao-responda@localhost>"),
  WORKER_POLL_MS: z.coerce.number().int().default(1000),
  LOG_LEVEL: z.string().default("info"),
});

export type Config = z.infer<typeof schema>;

function load(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configuração inválida ou ausente: ${fields}`);
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === "production" && cfg.WEBHOOK_ALLOW_PRIVATE_TARGETS) {
    throw new Error("WEBHOOK_ALLOW_PRIVATE_TARGETS não pode ser usado em produção");
  }
  return { ...cfg, PUBLIC_BASE_URL: cfg.PUBLIC_BASE_URL.replace(/\/+$/, "") };
}

export const config = load();
export const isProduction = config.NODE_ENV === "production";
