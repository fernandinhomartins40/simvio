/** Regras de senha nova: as mesmas no formulário e no servidor. */
export const PASSWORD_RULES: readonly { label: string; test: (password: string) => boolean }[] = [
  { label: "Ao menos 10 caracteres", test: (p) => p.length >= 10 },
  { label: "Uma letra minúscula", test: (p) => /\p{Ll}/u.test(p) },
  { label: "Uma letra maiúscula", test: (p) => /\p{Lu}/u.test(p) },
  { label: "Um número", test: (p) => /\d/.test(p) },
  { label: "Um caractere especial (como ! @ # $ -)", test: (p) => /[^\p{L}\d\s]/u.test(p) },
];

export const PASSWORD_MAX_LENGTH = 128;

export const isStrongPassword = (password: string) =>
  password.length <= PASSWORD_MAX_LENGTH && PASSWORD_RULES.every((rule) => rule.test(password));
