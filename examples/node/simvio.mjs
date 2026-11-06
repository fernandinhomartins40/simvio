// Cliente mínimo da API Simvio para backends Node.js 18+ (sem dependências).
// A chave secreta fica SOMENTE no servidor. Nunca envie para o navegador.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export class SimvioClient {
  /**
   * @param {{ apiBase: string, secretKey: string }} opts  apiBase ex.: https://seu-dominio/api
   */
  constructor({ apiBase, secretKey }) {
    this.apiBase = apiBase.replace(/\/+$/, "");
    this.secretKey = secretKey;
  }

  async #request(method, path, body, headers = {}) {
    const res = await fetch(`${this.apiBase}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        "content-type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json?.error?.message ?? `Simvio respondeu ${res.status}`);
      err.status = res.status;
      err.code = json?.error?.code;
      throw err;
    }
    return json;
  }

  /**
   * Cria uma verificação. Use uma Idempotency-Key estável por tentativa (ex.: id do cadastro + tentativa):
   * repetir a chamada com a mesma chave devolve a mesma sessão.
   */
  createVerification({ phoneNumber, reference, purpose = "signup", redirectUrl }, idempotencyKey = randomUUID()) {
    return this.#request(
      "POST",
      "/v1/verifications",
      { phone_number: phoneNumber, reference, purpose, redirect_url: redirectUrl },
      { "idempotency-key": idempotencyKey },
    );
  }

  getVerification(id) {
    return this.#request("GET", `/v1/verifications/${encodeURIComponent(id)}`);
  }

  cancelVerification(id) {
    return this.#request("POST", `/v1/verifications/${encodeURIComponent(id)}/cancel`);
  }
}

/**
 * Valida a assinatura de um webhook Simvio.
 * Assinatura = HMAC-SHA256(segredo, `${timestamp}.${eventId}.${corpoBruto}`) em hex, cabeçalho "v1=<hex>".
 * Use o CORPO BRUTO (bytes recebidos), antes de qualquer parse de JSON.
 * @returns {object} payload já validado
 */
export function verifyWebhook({ rawBody, headers, secret, toleranceSeconds = 300, now = Date.now() }) {
  const eventId = headers["simvio-event-id"];
  const timestamp = Number(headers["simvio-timestamp"]);
  const signature = String(headers["simvio-signature"] ?? "");
  if (!eventId || !Number.isFinite(timestamp) || !signature.startsWith("v1=")) {
    throw new Error("Cabeçalhos de assinatura ausentes");
  }
  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds) {
    throw new Error("Timestamp fora da tolerância (possível repetição)");
  }
  const expected = createHmac("sha256", secret).update(`${timestamp}.${eventId}.${rawBody}`).digest("hex");
  const a = Buffer.from(signature.slice(3), "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Assinatura inválida");
  const payload = JSON.parse(rawBody);
  if (payload.event_id !== eventId) throw new Error("event_id divergente");
  return payload;
}
