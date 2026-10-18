import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { E2E_CRON_SECRET } from "./env";
import { signUp, uniqueEmail } from "./helpers";

test("onay ekranı: zorunlu onaylar olmadan hizmet yok, pazarlama isteğe bağlı", async ({
  page,
}) => {
  await signUp(page, uniqueEmail("kvkk"), { consent: false });
  await expect(page.getByRole("heading", { name: "Kişisel verilerin" })).toBeVisible();

  // Onaysız: sayfalar onay ekranına döner, API 403; veri hakları açık.
  await page.goto("/kartlarim");
  await expect(page).toHaveURL("/onay");
  expect((await page.request.get("/api/me/cards")).status()).toBe(403);
  expect((await page.request.get("/api/me/export")).status()).toBe(200);

  const form = page.getByRole("form", { name: "KVKK onayı" });
  await form.getByLabel("okudum").check();
  await form.getByRole("button", { name: "Onayla ve devam et" }).click();
  await expect(form.getByRole("alert")).toContainText("açık rızanı onayla");

  // Hata sonrası işaretlenenler korunur.
  await expect(form.getByLabel("okudum")).toBeChecked();
  await form.getByLabel("açık rıza veriyorum").check();
  await form.getByRole("button", { name: "Onayla ve devam et" }).click();
  await expect(page).toHaveURL("/baslangic");
  expect((await page.request.get("/api/me/cards")).status()).toBe(200);

  // Aydınlatma metni herkese açık ve sürümlü.
  await page.goto("/aydinlatma");
  await expect(page.getByRole("heading", { name: "KVKK Aydınlatma Metni" })).toBeVisible();
  await expect(page.getByText(/^Sürüm \d{4}-\d{2}-\d{2}(\.\d+)?$/)).toBeVisible();
});

test("Profilim: verilerimi indir, pazarlama izni ve hesabı sil", async ({ page, request }) => {
  const email = uniqueEmail("kvkk");
  await signUp(page, email);
  await page.goto("/profil");
  const privacy = page.locator("#verilerim");
  await expect(privacy).toContainText("onay:");

  // Pazarlama izni (varsayılan kapalı) açılıp kapatılabilir.
  const marketing = privacy.getByLabel("duyurularını e-postayla almak istiyorum");
  await expect(marketing).not.toBeChecked();
  await marketing.check();
  await expect(privacy.getByRole("status")).toHaveText("Kaydedildi.");

  // Veri kopyası JSON olarak iner.
  const download = page.waitForEvent("download");
  await privacy.getByRole("link", { name: "Verilerimi indir (JSON)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^kartplan-verilerim-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile((await file.path())!, "utf8")) as {
    account: { email: string };
    consents: { kind: string; granted: boolean }[];
  };
  expect(data.account.email).toBe(email);
  expect(data.consents.filter((c) => c.kind === "pazarlama").map((c) => c.granted)).toEqual([
    false,
    true,
  ]);

  // Hesap silme: e-posta yazılarak onaylanır; oturum kapanır, giriş engellenir.
  await privacy.locator("summary", { hasText: "Hesabımı sil" }).click();
  const remove = privacy.getByRole("form", { name: "Hesabı sil" });
  await remove.getByRole("textbox").fill("baska@kartplan.test");
  await remove.getByRole("button", { name: "Hesabımı sil" }).click();
  await expect(remove.getByRole("alert")).toContainText("e-posta adresini aynen yaz");
  await remove.getByRole("textbox").fill(email);
  await remove.getByRole("button", { name: "Hesabımı sil" }).click();
  await expect(page).toHaveURL("/?hesap=silindi");
  await expect(page.getByRole("status")).toContainText("30 gün içinde kalıcı olarak silinecek");
  await page.goto("/plan");
  await expect(page).toHaveURL("/");

  await page.goto("/giris");
  await page.getByLabel("E-posta").fill(email);
  await page.getByRole("button", { name: "Giriş bağlantısı gönder" }).click();
  await expect(page.getByText(/^Bu hesapla giriş yapılamıyor/)).toBeVisible();

  // Kalıcı silme işi zamanlanmış iş anahtarı ister.
  expect((await request.get("/api/cron/purge-accounts")).status()).toBe(401);
  const purge = await request.get("/api/cron/purge-accounts", {
    headers: { authorization: `Bearer ${E2E_CRON_SECRET}` },
  });
  expect(purge.status()).toBe(200);
});

test("API ile hesap silme", async ({ page }) => {
  await signUp(page);
  expect((await page.request.delete("/api/me")).status()).toBe(204);
  expect((await page.request.get("/api/me/cards")).status()).toBe(401);
});
