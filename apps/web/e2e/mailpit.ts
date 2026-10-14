import { expect } from "@playwright/test";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

type MailpitSearch = { messages: { ID: string }[] };
type MailpitMessage = { Text: string; Subject: string };

/** Mailpit'te verilen adrese gelen son e-postadaki giriş bağlantısını döndürür. */
export async function getMagicLink(email: string): Promise<string> {
  let messageId: string | undefined;
  await expect
    .poll(
      async () => {
        const query = encodeURIComponent(`to:"${email}"`);
        const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`);
        const data = (await res.json()) as MailpitSearch;
        messageId = data.messages[0]?.ID;
        return messageId;
      },
      { message: `${email} adresine giriş e-postası gelmedi`, timeout: 15_000 },
    )
    .toBeTruthy();

  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${messageId}`);
  const message = (await res.json()) as MailpitMessage;
  expect(message.Subject).toBe("KartPlan giriş bağlantın");
  const link = message.Text.match(/https?:\/\/\S+\/api\/auth\/callback\/nodemailer\S+/)?.[0];
  if (!link) throw new Error("E-postada giriş bağlantısı bulunamadı");
  return link;
}
