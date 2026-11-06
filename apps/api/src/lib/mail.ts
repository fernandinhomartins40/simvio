import nodemailer from "nodemailer";
import { config } from "../config.js";

const transport = config.SMTP_URL ? nodemailer.createTransport(config.SMTP_URL) : null;

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** Caixa em memória usada somente nos testes automatizados. */
export const testOutbox: Mail[] = [];

/** Sem provedor configurado o e-mail não sai. Em desenvolvimento a conta é confirmada automaticamente. */
export const mailConfigured = !!transport;

export async function sendMail(mail: Mail): Promise<boolean> {
  if (config.NODE_ENV === "test") {
    testOutbox.push(mail);
    return true;
  }
  if (!transport) {
    console.warn(JSON.stringify({ level: "warn", msg: "e-mail não enviado: SMTP_URL ausente", subject: mail.subject }));
    return false;
  }
  try {
    await transport.sendMail({ from: config.MAIL_FROM, ...mail });
    return true;
  } catch (err) {
    // Nunca registrar destinatário ou corpo: o corpo pode conter link com token.
    console.error(JSON.stringify({ level: "error", msg: "falha ao enviar e-mail", error: (err as Error).message }));
    return false;
  }
}
