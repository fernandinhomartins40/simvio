import nodemailer from "nodemailer";
import { config } from "../config.js";

const transport = config.SMTP_URL ? nodemailer.createTransport(config.SMTP_URL) : null;
const veloKey = config.VELOMAIL_API_KEY || null;

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Caixa em memória usada somente nos testes automatizados. */
export const testOutbox: Mail[] = [];

async function sendViaVelomail(mail: Mail, key: string) {
  // O VeloMail recusa "Nome <email>" no from: o nome vai em from_name.
  const parts = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(config.MAIL_FROM);
  const res = await fetch(`${config.VELOMAIL_API_URL.replace(/\/$/, "")}/emails/send`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify({
      from: parts ? parts[2] : config.MAIL_FROM,
      ...(parts?.[1] ? { from_name: parts[1] } : {}),
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html ?? mail.text,
      // Link com token não pode passar por redirecionador de clique.
      tracking_enabled: false,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`VeloMail respondeu ${res.status}`);
}

/** Sem provedor configurado o e-mail não sai. Em desenvolvimento a conta é confirmada automaticamente. */
export const mailConfigured = !!(transport || veloKey);

export async function sendMail(mail: Mail): Promise<boolean> {
  if (config.NODE_ENV === "test") {
    testOutbox.push(mail);
    return true;
  }
  if (!transport && !veloKey) {
    console.warn(JSON.stringify({ level: "warn", msg: "e-mail não enviado: nenhum provedor configurado", subject: mail.subject }));
    return false;
  }
  try {
    if (veloKey) await sendViaVelomail(mail, veloKey);
    else await transport!.sendMail({ from: config.MAIL_FROM, ...mail });
    return true;
  } catch (err) {
    // Nunca registrar destinatário ou corpo: o corpo pode conter link com token.
    console.error(JSON.stringify({ level: "error", msg: "falha ao enviar e-mail", error: (err as Error).message }));
    return false;
  }
}
