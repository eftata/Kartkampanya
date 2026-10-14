import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { getMagicLink } from "./mailpit";

export const uniqueEmail = (prefix = "e2e") =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@kartplan.test`;

/** Magic link ile yeni kullanıcı kaydeder ve oturum açar; giriş bağlantısını döndürür. */
export async function signUp(page: Page, email = uniqueEmail()): Promise<string> {
  await page.goto("/giris");
  await page.getByLabel("E-posta").fill(email);
  await page.getByRole("button", { name: "Giriş bağlantısı gönder" }).click();
  await expect(page).toHaveURL("/giris/dogrula");
  const magicLink = await getMagicLink(email);
  await page.goto(magicLink);
  return magicLink;
}
