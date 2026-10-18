import { expect, test } from "@playwright/test";

import { makeAdmin, signUp, uniqueEmail } from "./helpers";

const turkeyToday = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

test("huni: kullanım günü kaydedilir, admin huni sayfasını görür", async ({ page, browser }) => {
  // Admin hesapları huniye girmez: tablo boş kalmasın diye admin olmayan bir kullanıcı daha.
  const member = await browser.newContext();
  await signUp(await member.newPage());
  await member.close();

  const email = uniqueEmail("huni");
  await signUp(page, email);
  await page.goto("/kartlarim");

  // Kullanım günü yanıttan sonra yazılır; veri kopyasında görünür.
  await expect
    .poll(async () => {
      const data = (await (await page.request.get("/api/me/export")).json()) as {
        activeDays: string[];
      };
      return data.activeDays;
    })
    .toContain(turkeyToday());

  await page.goto("/admin/huni");
  await expect(page.getByRole("heading", { name: "Sayfa bulunamadı" })).toBeVisible();
  await makeAdmin(email);
  await page.goto("/admin/huni");
  await expect(page.getByRole("heading", { name: "Huni", exact: true })).toBeVisible();
  const total = page.getByRole("region", { name: "Toplam" });
  for (const step of ["Kayıt oldu", "Kart girdi", "Planı gördü", "2. hafta geri döndü"]) {
    await expect(total.getByRole("group", { name: step })).toBeVisible();
  }
  await expect(
    page.getByRole("region", { name: "Kayıt haftasına göre" }).getByRole("row").nth(1),
  ).toContainText("haftası");
});
