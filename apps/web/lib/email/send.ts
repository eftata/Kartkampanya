import "server-only";

import { createTransport } from "nodemailer";

import { smtpOptions } from "@/lib/email/magic-link";

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
};

export type SendMail = (mail: Mail) => Promise<void>;

/** Bildirim e-postası (magic link ile aynı SMTP). Teslim edilemezse hata fırlatır. */
export const sendMail: SendMail = async (mail) => {
  const transport = createTransport(smtpOptions());
  const result = await transport.sendMail({
    from: process.env.EMAIL_FROM ?? "KartPlan <no-reply@kartplan.local>",
    ...mail,
  });
  const failed = [...result.rejected, ...(result.pending ?? [])];
  if (failed.length) throw new Error(`E-posta gönderilemedi: ${failed.join(", ")}`);
};
