import { expect, test } from "@playwright/test";

import { createDraftCampaign, deleteCampaigns, makeAdmin, signUp, uniqueEmail } from "./helpers";

test("onay kontrolleri tutarsız kampanyanın onayını engeller, benzerini gösterir", async ({
  page,
}) => {
  const run = Date.now().toString(36);
  const title = `E2E kontrol ${run}`;
  const ids = [
    await createDraftCampaign(title),
    await createDraftCampaign(`${title} kopya`), // aynı program, aynı tarihler, benzer başlık
  ];
  try {
    const email = uniqueEmail("kontrol");
    await signUp(page, email);
    await makeAdmin(email);
    await page.goto(`/admin/kampanyalar/${ids[0]}`);

    await expect(page.getByRole("region", { name: "Benzer kampanyalar" })).toContainText(
      `${title} kopya`,
    );
    const form = page.getByRole("form", { name: "Kampanya düzenle" });
    const approve = form.getByRole("button", { name: "Kaydet ve onayla" });
    const checks = form.getByRole("region", { name: "Kontroller" });
    await expect(approve).toBeEnabled();

    // Üst limit tek kademenin ödülünden (100 TL) küçük: hata, onay kapalı.
    await form.getByRole("group", { name: "Kural 1" }).getByLabel("Üst limit (TL)").fill("50");
    await expect(checks).toContainText("tek kademenin ödülünden");
    await expect(approve).toBeDisabled();

    await form.getByRole("group", { name: "Kural 1" }).getByLabel("Üst limit (TL)").fill("300");
    await expect(approve).toBeEnabled();
    await approve.click();
    // Onay sonrası kuyruğa döner.
    await expect(page).toHaveURL("/admin/kampanyalar");
  } finally {
    await deleteCampaigns(ids);
  }
});

test("kullanıcı kampanya sayfasından hata bildirir, admin kampanyada görür", async ({ page }) => {
  const run = Date.now().toString(36);
  const title = `E2E hatalı ${run}`;
  // 2099 tarihli: paralel testlerin planlarına girmez.
  const [id] = [await createDraftCampaign(title, { status: "APPROVED" })];
  try {
    const email = uniqueEmail("bildir");
    await signUp(page, email);
    await page.goto(`/kampanyalarim/${id}`);
    await page.getByRole("link", { name: /yanlış bir bilgi mi var/ }).click();
    await expect(page).toHaveURL(/\/geri-bildirim\?kampanya=/);

    const form = page.getByRole("form", { name: "Geri bildirim" });
    await expect(form).toContainText(`Kampanya: ${title}`);
    await expect(
      form.getByRole("radio", { name: "Kampanya ya da kart bilgisi yanlış" }),
    ).toBeChecked();
    await form.getByLabel("Mesajın").fill(`Bitiş tarihi yanlış ${run}`);
    await form.getByRole("button", { name: "Gönder" }).click();
    await expect(form.getByRole("status")).toContainText("Teşekkürler");
    await expect(page.getByRole("region", { name: "Gönderdiklerin" })).toContainText(
      `Kampanya: ${title}`,
    );

    await makeAdmin(email);
    await page.goto(`/admin/kampanyalar/${id}`);
    await expect(page.getByRole("region", { name: "Hata bildirimleri" })).toContainText(
      `Bitiş tarihi yanlış ${run}`,
    );
    await page.goto("/admin/durum");
    await expect(page.getByRole("region", { name: "Veri doğruluğu" })).toContainText(title);
  } finally {
    await deleteCampaigns([id!]);
  }
});
