import { config } from "../config.js";
import type { Mail } from "./mail.js";

// Cores da identidade visual (apps/web/src/index.css). E-mail exige estilos inline e tabelas.
const PETROLEO = "#073E42";
const PETROLEO_SOFT = "#3D6467";
const LIMA = "#C6F36A";
const LIMA_600 = "#A9D94A";
const MINERAL = "#F3F7F3";
const LINHA = "#DDE7E2";
const FONT = "'Plus Jakarta Sans',Arial,Helvetica,sans-serif";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

interface Content {
  to: string;
  subject: string;
  title: string;
  /** Parágrafos em texto puro; o HTML é escapado aqui. */
  paragraphs: string[];
  action?: { label: string; url: string };
  /** Texto menor abaixo do botão (prazo, "se não foi você"). */
  note?: string;
}

function render({ to, subject, title, paragraphs, action, note }: Content): Mail {
  const base = config.PUBLIC_BASE_URL;
  const text = [...paragraphs, ...(action ? [`${action.label}:\n${action.url}`] : []), ...(note ? [note] : []), `Simvio — ${base}`].join("\n\n");
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${PETROLEO_SOFT};">${escapeHtml(p)}</p>`)
    .join("");
  const button = action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="border-radius:14px;background:${LIMA};">
        <a href="${escapeHtml(action.url)}" style="display:inline-block;padding:15px 28px;font-family:${FONT};font-size:16px;font-weight:700;color:${PETROLEO};text-decoration:none;">${escapeHtml(action.label)}</a>
      </td></tr></table>
      <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:${PETROLEO_SOFT};">Se o botão não abrir, copie e cole este endereço no navegador:<br><a href="${escapeHtml(action.url)}" style="color:${PETROLEO};word-break:break-all;">${escapeHtml(action.url)}</a></p>`
    : "";
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${MINERAL};font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(paragraphs[0] ?? title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MINERAL};"><tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
    <tr><td style="padding:0 8px 20px;"><a href="${base}"><img src="${base}/brand/logo-email.png" width="150" alt="Simvio" style="display:block;width:150px;height:auto;border:0;"></a></td></tr>
    <tr><td style="background:#FFFFFF;border:1px solid ${LINHA};border-radius:20px;padding:36px 32px;">
      <h1 style="margin:0 0 16px;font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-0.5px;color:${PETROLEO};">${escapeHtml(title)}<span style="color:${LIMA_600};">.</span></h1>
      ${body}${button}
      ${note ? `<p style="margin:16px 0 0;padding-top:16px;border-top:1px solid ${LINHA};font-size:14px;line-height:1.5;color:${PETROLEO_SOFT};">${escapeHtml(note)}</p>` : ""}
    </td></tr>
    <tr><td style="padding:20px 8px 0;font-size:13px;line-height:1.5;color:${PETROLEO_SOFT};">Simvio: verificação de celular pelo SMS que o próprio usuário envia.<br>Este é um e-mail automático da sua conta. Não é preciso responder.</td></tr>
  </table>
</td></tr></table>
</body></html>`;
  return { to, subject, text, html };
}

export const confirmEmailMail = (to: string, name: string, url: string) =>
  render({
    to,
    subject: "Confirme seu e-mail na Simvio",
    title: "Confirme seu e-mail",
    paragraphs: [`Olá, ${name}. Falta só um passo para entrar no painel da Simvio.`],
    action: { label: "Confirmar meu e-mail", url },
    note: "O link vale por 48 horas. Se você não criou esta conta, ignore esta mensagem.",
  });

export const accountExistsMail = (to: string) =>
  render({
    to,
    subject: "Você já tem uma conta na Simvio",
    title: "Você já tem uma conta",
    paragraphs: ["Alguém tentou criar uma conta com este e-mail. Se foi você, entre no painel ou recupere sua senha."],
    action: { label: "Entrar na Simvio", url: `${config.PUBLIC_BASE_URL}/entrar` },
    note: "Se não foi você, ignore esta mensagem. Nada mudou na sua conta.",
  });

export const resetPasswordMail = (to: string, url: string) =>
  render({
    to,
    subject: "Redefina sua senha da Simvio",
    title: "Crie uma nova senha",
    paragraphs: ["Recebemos um pedido para redefinir a senha da sua conta."],
    action: { label: "Criar nova senha", url },
    note: "O link vale por 1 hora e só pode ser usado uma vez. Se não foi você, ignore esta mensagem: sua senha continua a mesma.",
  });

export const passwordChangedMail = (to: string) =>
  render({
    to,
    subject: "Sua senha da Simvio foi alterada",
    title: "Senha alterada",
    paragraphs: ["A senha da sua conta acabou de ser alterada."],
    note: "Se não foi você, peça uma nova senha agora mesmo na tela de login e avise o responsável pela sua organização.",
    action: { label: "Ir para o login", url: `${config.PUBLIC_BASE_URL}/entrar` },
  });

export const invitationMail = (to: string, inviter: string, organization: string, url: string) =>
  render({
    to,
    subject: `Convite para ${organization} na Simvio`,
    title: "Você foi convidado",
    paragraphs: [`${inviter} convidou você para a equipe ${organization} na Simvio.`],
    action: { label: "Aceitar convite", url },
    note: "O convite vale por 7 dias. Se não esperava por ele, ignore esta mensagem.",
  });
