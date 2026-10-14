import "server-only";

import { createTransport } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

export function smtpOptions(): SMTPTransport.Options {
  const port = Number(process.env.EMAIL_SERVER_PORT ?? 1025);
  const user = process.env.EMAIL_SERVER_USER;
  return {
    host: process.env.EMAIL_SERVER_HOST ?? "localhost",
    port,
    secure: port === 465,
    ...(user ? { auth: { user, pass: process.env.EMAIL_SERVER_PASSWORD ?? "" } } : {}),
  };
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** Türkçe giriş bağlantısı e-postası (Auth.js `sendVerificationRequest`). */
export async function sendMagicLink({
  identifier,
  url,
  from,
}: {
  identifier: string;
  url: string;
  from: string;
}) {
  const transport = createTransport(smtpOptions());
  const result = await transport.sendMail({
    to: identifier,
    from,
    subject: "KartPlan giriş bağlantın",
    text: `KartPlan'a giriş yapmak için bu bağlantıyı aç:\n${url}\n\nBağlantı 24 saat geçerlidir. Bu isteği sen yapmadıysan e-postayı yok sayabilirsin.\n`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px">
  <h1 style="font-size:20px">KartPlan'a giriş yap</h1>
  <p><a href="${escapeHtml(url)}" style="display:inline-block;background:#171717;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Giriş yap</a></p>
  <p style="color:#666;font-size:13px">Bağlantı 24 saat geçerlidir. Bu isteği sen yapmadıysan e-postayı yok sayabilirsin.</p>
</div>`,
  });
  const failed = [...result.rejected, ...(result.pending ?? [])];
  if (failed.length) {
    throw new Error(`Giriş e-postası gönderilemedi: ${failed.join(", ")}`);
  }
}
