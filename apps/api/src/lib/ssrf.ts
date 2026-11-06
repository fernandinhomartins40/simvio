import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { config } from "../config.js";

/**
 * Proteção contra SSRF para webhooks.
 * - Somente HTTPS (HTTP apenas com WEBHOOK_ALLOW_PRIVATE_TARGETS em desenvolvimento isolado).
 * - Bloqueia loopback, redes privadas, link-local, CGNAT, metadados de nuvem, multicast e
 *   equivalentes IPv6 (inclusive IPv4 mapeado em IPv6 e NAT64).
 * - A checagem acontece no `lookup` da própria conexão: o IP validado é o IP conectado,
 *   o que impede DNS rebinding entre validação e envio. Redirects não são seguidos.
 */
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blocked.check(address, "ipv4");
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return blocked.check(mapped[1]!, "ipv4");
    return blocked.check(address, "ipv6");
  }
  return true;
}

export class SsrfError extends Error {}

/** Valida a forma da URL de destino (cadastro e envio). */
export function validateWebhookUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError("URL inválida.");
  }
  const allowPrivate = config.WEBHOOK_ALLOW_PRIVATE_TARGETS;
  if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:")) {
    throw new SsrfError("O endereço do webhook precisa usar HTTPS.");
  }
  if (url.username || url.password) throw new SsrfError("A URL não pode conter usuário ou senha.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!allowPrivate) {
    if (isIP(host) && isBlockedAddress(host)) throw new SsrfError("Endereços internos ou privados não são permitidos.");
    if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host)) {
      throw new SsrfError("Endereços internos ou privados não são permitidos.");
    }
  }
  return url;
}

/** `lookup` usado pela conexão HTTP: resolve e recusa qualquer IP bloqueado. */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = addresses as LookupAddress[];
    if (!config.WEBHOOK_ALLOW_PRIVATE_TARGETS && (list.length === 0 || list.some((a) => isBlockedAddress(a.address)))) {
      return callback(new SsrfError("Destino resolve para endereço interno ou privado."), "", 0);
    }
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    const first = list[0]!;
    callback(null, first.address, first.family);
  });
};
