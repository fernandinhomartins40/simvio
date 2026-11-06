import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { invalid } from "./errors.js";

/** Valida entrada com Zod e converte o erro em resposta 400 consistente. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    const field = issue?.path.join(".") || undefined;
    throw invalid(field ? `Campo inválido: ${field}.` : "Requisição inválida.", {
      field,
      issues: r.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
  }
  return r.data;
}

// Tokens opacos na URL (página pública) nunca vão inteiros para logs.
const SENSITIVE_PATHS: RegExp[] = [/(\/v1\/public\/sessions\/)[^/?#]+/, /(\/v\/)[^/?#]+/];

export function redactUrl(url: string): string {
  let out = url.split("?")[0] ?? url;
  for (const re of SENSITIVE_PATHS) out = out.replace(re, "$1[redacted]");
  return out;
}

export function noStore(reply: FastifyReply) {
  reply.header("cache-control", "no-store");
}

export function clientIp(req: FastifyRequest) {
  return req.ip;
}
