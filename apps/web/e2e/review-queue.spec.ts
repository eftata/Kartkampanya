import { expect, test } from "@playwright/test";

import { createDraftCampaign, deleteCampaigns, makeAdmin, signUp, uniqueEmail } from "./helpers";

test("onay kuyruğu API'si yalnızca admin içindir", async ({ page, request }) => {
  expect((await request.get("/api/admin/review-queue")).status()).toBe(401);
  await signUp(page);
  expect((await page.request.get("/api/admin/review-queue")).status()).toBe(403);
  expect(
    (await page.request.put("/api/admin/campaigns/yok", { data: { action: "reject" } })).status(),
  ).toBe(403);
});

test("admin kampanyayı ham metinle karşılaştırıp düzenler, onaylar ve reddeder", async ({
  page,
}) => {
  const run = Date.now().toString(36);
  const approveTitle = `E2E onay ${run}`;
  const rejectTitle = `E2E ret ${run}`;
  const ids = [await createDraftCampaign(approveTitle), await createDraftCampaign(rejectTitle)];
  page.on("dialog", (dialog) => dialog.accept());
  try {
    const email = uniqueEmail("onay");
    await signUp(page, email);
    await makeAdmin(email);

    await page.goto("/admin/kampanyalar");
    const queue = page.getByRole("table", { name: "Kampanyalar" });
    await queue.getByRole("link", { name: approveTitle }).click();
    await expect(page.getByRole("heading", { name: approveTitle })).toBeVisible();
    await expect(page.getByTestId("raw-text")).toContainText("En fazla 300 TL");
    await expect(page.getByRole("note")).toContainText("Örnek Market");

    const form = page.getByRole("form", { name: "Kampanya düzenle" });
    const rule = form.getByRole("group", { name: "Kural 1" });
    await expect(rule.getByLabel("Eşik (TL)")).toHaveValue("2.500");
    await expect(rule.getByLabel("Üst limit (TL)")).toHaveValue("300");

    // Geçersiz tutar: hata gösterilir, girilenler korunur
    await rule.getByLabel("Üst limit (TL)").fill("üç yüz");
    await form.getByRole("button", { name: "Kaydet ve onayla" }).click();
    await expect(form.getByRole("alert")).toHaveText(
      "Kural 1 · Üst limit: tutarı TL olarak yaz (ör. 2.500).",
    );
    await expect(rule.getByLabel("Üst limit (TL)")).toHaveValue("üç yüz");

    // Taslağı kaydet: durum değişmez
    await rule.getByLabel("Üst limit (TL)").fill("500");
    await form.getByLabel("Katılım", { exact: true }).selectOption("SMS");
    await form.getByRole("button", { name: "Taslağı kaydet" }).click();
    await expect(form.getByRole("status")).toHaveText("Kampanya kaydedildi.");
    await expect(page.getByTestId("campaign-status")).toHaveText("Onay bekliyor");
    const history = page.getByRole("region", { name: "Kampanyanın işlem geçmişi" });
    await expect(history).toContainText("Kampanya düzenlendi");

    // Onayla → kuyruğa döner, kampanya onaylananlar sekmesinde
    await form.getByRole("button", { name: "Kaydet ve onayla" }).click();
    await expect(page).toHaveURL("/admin/kampanyalar");
    await expect(queue.getByRole("link", { name: approveTitle })).toHaveCount(0);
    await page.getByRole("link", { name: /^Onaylandı/ }).click();
    await queue.getByRole("link", { name: approveTitle }).click();
    await expect(page.getByTestId("campaign-status")).toHaveText("Onaylandı");
    await expect(rule.getByLabel("Üst limit (TL)")).toHaveValue("500");
    await expect(form.getByLabel("Katılım", { exact: true })).toHaveValue("SMS");
    await expect(history).toContainText("Kampanya onaylandı");
    await expect(history).toContainText(email);

    // Reddet (gerekçeyle)
    await page.goto("/admin/kampanyalar");
    await queue.getByRole("link", { name: rejectTitle }).click();
    const reject = page.getByRole("form", { name: "Kampanyayı reddet" });
    await reject.getByLabel("Ret gerekçesi").fill("Kampanya bize uygun değil");
    await reject.getByRole("button", { name: "Reddet" }).click();
    await expect(page).toHaveURL("/admin/kampanyalar");
    await expect(queue.getByRole("link", { name: rejectTitle })).toHaveCount(0);
  } finally {
    await deleteCampaigns(ids);
  }
});
