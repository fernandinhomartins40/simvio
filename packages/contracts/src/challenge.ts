/**
 * Formato da mensagem de verificação: "SIMVIO <token>", com token Base32 (RFC 4648,
 * sem padding) de 26 caracteres que carrega 128 bits aleatórios gerados pelo servidor.
 */
export const CHALLENGE_PREFIX = "SIMVIO";
export const CHALLENGE_TOKEN_LENGTH = 26;
export const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const MESSAGE_RE = new RegExp(
  "^\\s*" + CHALLENGE_PREFIX + "\\s+([A-Za-z2-7]{" + CHALLENGE_TOKEN_LENGTH + "})\\s*$",
  "i",
);

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function buildChallengeMessage(token: string): string {
  return `${CHALLENGE_PREFIX} ${token}`;
}

/**
 * Extrai o token de um corpo de SMS. Retorna null se a mensagem não seguir exatamente o
 * formato (mensagens editadas ou com texto adicional são rejeitadas).
 */
export function parseChallengeMessage(body: string): string | null {
  const m = MESSAGE_RE.exec(body);
  return m ? m[1]!.toUpperCase() : null;
}
