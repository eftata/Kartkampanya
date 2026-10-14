import { expect, test } from "@playwright/test";

import { getMagicLink } from "./mailpit";

test("giriş yapmamış kullanıcı korumalı sayfalardan landing'e yönlendirilir", async ({ page }) => {
  for (const path of ["/plan", "/kartlarim", "/admin/katalog"]) {
    await page.goto(path);
    await expect(page).toHaveURL("/");
  }
  await expect(page.getByRole("heading", { level: 1 })).toContainText("en çok kazanacağın");
});

test("magic link ile kayıt olur, giriş yapar ve çıkış yapar", async ({ page }) => {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@kartplan.test`;

  await page.goto("/");
  await page.getByRole("link", { name: "Giriş yap" }).click();
  await expect(page).toHaveURL("/giris");

  await page.getByLabel("E-posta").fill(email);
  await page.getByRole("button", { name: "Giriş bağlantısı gönder" }).click();
  await expect(page).toHaveURL("/giris/dogrula");
  await expect(page.getByText("E-postanı kontrol et")).toBeVisible();

  const magicLink = await getMagicLink(email);
  await page.goto(magicLink);
  await expect(page).toHaveURL("/plan");
  await expect(page.getByTestId("user-email")).toHaveText(email);
  await expect(page.getByRole("heading", { name: "Bu ayın planı" })).toBeVisible();

  await page.getByRole("button", { name: "Çıkış yap" }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/plan");
  await expect(page).toHaveURL("/");

  // Bağlantı tek kullanımlıktır.
  await page.goto(magicLink);
  await expect(page).toHaveURL(/\/giris\?error=Verification/);
  await expect(page.getByText(/süresi dolmuş ya da daha önce kullanılmış/)).toBeVisible();
});

test("geçersiz e-posta için hata gösterir", async ({ page }) => {
  await page.goto("/giris");
  await page.getByLabel("E-posta").fill("gecersiz");
  await page.getByRole("button", { name: "Giriş bağlantısı gönder" }).click();
  await expect(page.getByText("Geçerli bir e-posta adresi gir.")).toBeVisible();
  await expect(page.getByLabel("E-posta")).toHaveValue("gecersiz");
  await expect(page).toHaveURL("/giris");
});
