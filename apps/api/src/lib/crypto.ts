import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { base32Encode } from "@simvio/contracts";
import { config } from "../config.js";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// ---------------------------------------------------------------------------
// Aleatoriedade e digests

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Token Base32 de 128 bits para o desafio "SIMVIO <token>". */
export function randomChallengeToken(): string {
  return base32Encode(randomBytes(16));
}

/** Digest para segredos de alta entropia (chaves, credenciais, tokens). */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const hmacKey = Buffer.from(config.SIMVIO_HMAC_KEY, "base64");
if (hmacKey.length < 32) throw new Error("SIMVIO_HMAC_KEY deve ter ao menos 32 bytes em base64");

/** Digest com chave para valores de baixa entropia (telefones). */
export function keyedDigest(value: string): string {
  return createHmac("sha256", hmacKey).update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// ---------------------------------------------------------------------------
// Cifragem AES-256-GCM com rotação de chaves

const keys = new Map<string, Buffer>();
let currentKeyId = "";
for (const entry of config.SIMVIO_ENCRYPTION_KEYS.split(",")) {
  const [id, b64] = entry.trim().split(":");
  if (!id || !b64) throw new Error("SIMVIO_ENCRYPTION_KEYS mal formatada (use id:base64)");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error(`Chave ${id} deve ter 32 bytes`);
  keys.set(id, key);
  if (!currentKeyId) currentKeyId = id;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys.get(currentKeyId)!, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [currentKeyId, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const [id, iv, tag, ct] = payload.split(".");
  const key = id ? keys.get(id) : undefined;
  if (!key || !iv || !tag || ct === undefined) throw new Error("Conteúdo cifrado inválido ou chave ausente");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/** Recifra com a chave atual (usado na rotação de chaves). */
export function reencrypt(payload: string): string {
  return payload.startsWith(`${currentKeyId}.`) ? payload : encrypt(decrypt(payload));
}

// ---------------------------------------------------------------------------
// Senhas (scrypt)

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return timingSafeEqual(actual, expected);
}
