import { describe, expect, it } from "vitest";
import {
  base32Encode,
  buildChallengeMessage,
  maskPhone,
  normalizeSenderAddress,
  normalizeUserPhone,
  parseChallengeMessage,
} from "./index.js";

describe("telefone", () => {
  it("normaliza entradas de usuário sem inserir nono dígito", () => {
    expect(normalizeUserPhone("+55 (11) 98765-4321")).toBe("+5511987654321");
    expect(normalizeUserPhone("11987654321")).toBe("+5511987654321");
    expect(normalizeUserPhone("5511987654321")).toBe("+5511987654321");
    expect(normalizeUserPhone("1187654321")).toBeNull(); // 8 dígitos: ambíguo
    expect(normalizeUserPhone("+5520987654321")).toBeNull(); // DDD inválido
    expect(normalizeUserPhone("+1 415 555 0100")).toBeNull();
  });

  it("normaliza remetentes do Android", () => {
    expect(normalizeSenderAddress("+5511987654321")).toBe("+5511987654321");
    expect(normalizeSenderAddress("011987654321")).toBe("+5511987654321");
    expect(normalizeSenderAddress("01511987654321")).toBe("+5511987654321");
    expect(normalizeSenderAddress("11987654321")).toBe("+5511987654321");
    expect(normalizeSenderAddress("BANCO")).toBeNull();
    expect(normalizeSenderAddress("29090")).toBeNull();
  });

  it("mascara", () => {
    expect(maskPhone("+5511987654321")).toBe("+55 11 9****-4321");
  });
});

describe("desafio", () => {
  it("codifica 16 bytes em 26 caracteres", () => {
    expect(base32Encode(new Uint8Array(16).fill(255))).toBe("7".repeat(25) + "4");
    expect(base32Encode(new TextEncoder().encode("foobar"))).toBe("MZXW6YTBOI");
    const token = base32Encode(new Uint8Array(16).fill(7));
    expect(token).toHaveLength(26);
    expect(parseChallengeMessage(buildChallengeMessage(token))).toBe(token);
  });

  it("rejeita mensagens editadas", () => {
    const token = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    expect(parseChallengeMessage(`  simvio ${token.toLowerCase()} `)).toBe(token);
    expect(parseChallengeMessage(`SIMVIO ${token} oi`)).toBeNull();
    expect(parseChallengeMessage(`Olá SIMVIO ${token}`)).toBeNull();
    expect(parseChallengeMessage(`SIMVIO ${token.slice(1)}`)).toBeNull();
    expect(parseChallengeMessage(`SIMVIO ABCDEFGHIJKLMNOPQRSTUVWXY1`)).toBeNull();
  });
});
