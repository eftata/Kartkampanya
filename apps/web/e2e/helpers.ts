import { createPrismaClient } from "@kartplan/db";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { getMagicLink } from "./mailpit";

export const uniqueEmail = (prefix = "e2e") =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@kartplan.test`;

/** Yeni kullanıcı kaydeder, oturum açar ve onboarding'e varmayı bekler; giriş bağlantısını döndürür. */
export async function signUp(page: Page, email = uniqueEmail()): Promise<string> {
  await page.goto("/giris");
  await page.getByLabel("E-posta").fill(email);
  await page.getByRole("button", { name: "Giriş bağlantısı gönder" }).click();
  await expect(page).toHaveURL("/giris/dogrula");
  const magicLink = await getMagicLink(email);
  await page.goto(magicLink);
  // Yeni kullanıcı /plan'a düşer ve oradan (akışla gelen bölümde, istemci tarafında) /baslangic'e
  // yönlenir. Bu yönlendirme bitmeden başka sayfaya gidilirse gezinmeler çakışır (ERR_ABORTED).
  await page.waitForURL("**/baslangic");
  return magicLink;
}

/** Kullanıcıya ADMIN rolü verir (testte yetki kurulumu; uygulamada bunun arayüzü yok). */
export async function makeAdmin(email: string): Promise<void> {
  const prisma = createPrismaClient();
  try {
    await prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
  } finally {
    await prisma.$disconnect();
  }
}
