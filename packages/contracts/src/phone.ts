/**
 * Telefones brasileiros (+55). A Simvio começa pelo Brasil e aceita apenas celulares
 * com nove dígitos após o DDD. Nunca inserimos o nono dígito por heurística: um número
 * ambíguo é rejeitado.
 */

// DDDs válidos atribuídos pela Anatel.
const VALID_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44,
  45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81,
  82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

const E164_BR_MOBILE = /^\+55(\d{2})(9\d{8})$/;

/** Retorna true se `value` já está em E.164 e é um celular brasileiro válido. */
export function isBrazilianMobileE164(value: string): boolean {
  const m = E164_BR_MOBILE.exec(value);
  return !!m && VALID_DDDS.has(Number(m[1]));
}

/**
 * Normaliza a entrada digitada por uma pessoa (formulário) para E.164.
 * Aceita "+55 (11) 98765-4321", "11987654321", "5511987654321".
 * Retorna null para formatos ambíguos ou que não sejam celular.
 */
export function normalizeUserPhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  let candidate: string | null = null;
  if (trimmed.startsWith("+")) {
    candidate = `+${digits}`;
  } else if (digits.length === 11) {
    candidate = `+55${digits}`;
  } else if (digits.length === 13 && digits.startsWith("55")) {
    candidate = `+${digits}`;
  }
  return candidate && isBrazilianMobileE164(candidate) ? candidate : null;
}

/**
 * Normaliza o remetente informado pelo Android (originatingAddress) para E.164.
 * Formatos aceitos: +55DDDNNNNNNNNN, 55DDD..., DDD..., 0DDD..., 0 + operadora (2 dígitos) + DDD...
 * Remetentes alfanuméricos, códigos curtos ou formatos ambíguos retornam null e nunca aprovam.
 */
export function normalizeSenderAddress(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  let candidate: string | null = null;
  if (trimmed.startsWith("+")) candidate = `+${digits}`;
  else if (digits.length === 13 && digits.startsWith("55")) candidate = `+${digits}`;
  else if (digits.length === 11) candidate = `+55${digits}`;
  else if (digits.length === 12 && digits.startsWith("0")) candidate = `+55${digits.slice(1)}`;
  else if (digits.length === 14 && digits.startsWith("0")) candidate = `+55${digits.slice(3)}`;
  return candidate && isBrazilianMobileE164(candidate) ? candidate : null;
}

/** Mascara um telefone para históricos: +55 11 9****-4321. */
export function maskPhone(e164: string): string {
  const m = E164_BR_MOBILE.exec(e164);
  if (!m) return "***";
  return `+55 ${m[1]} 9****-${m[2]!.slice(-4)}`;
}

/** Formata para exibição a quem precisa conferir o número: +55 11 98765-4321. */
export function formatPhone(e164: string): string {
  const m = E164_BR_MOBILE.exec(e164);
  if (!m) return e164;
  return `+55 ${m[1]} ${m[2]!.slice(0, 5)}-${m[2]!.slice(5)}`;
}
