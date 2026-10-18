import { expect, test } from "@playwright/test";

import { makeAdmin, signUp, uniqueEmail } from "./helpers";

test("geri bildirim: menüden açılır, kart numarası reddedilir, admin durumunu değiştirir", async ({
  page,
  request,
}) => {
  expect((await request.post("/api/me/feedback", { data: {} })).status()).toBe(401);

  const run = Date.now().toString(36);
  const email = uniqueEmail("gb");
  await signUp(page, email);
  await page.goto("/kartlarim");
  await page.getByRole("link", { name: "Geri bildirim" }).click();
  await expect(page).toHaveURL("/geri-bildirim?sayfa=%2Fkartlarim");

  const form = page.getByRole("form", { name: "Geri bildirim" });
  await form.getByText("Bir şey çalışmıyor").click();
  await form.getByLabel("4 / 5").check({ force: true });
  const message = form.getByLabel("Mesajın");
  await message.fill(`Kartım 4111 1111 1111 1111 eklenmiyor ${run}`);
  await form.getByRole("button", { name: "Gönder" }).click();
  await expect(form.getByRole("alert")).toContainText("kart numarası");
  // Hata sonrası girilenler korunur.
  await expect(message).toHaveValue(`Kartım 4111 1111 1111 1111 eklenmiyor ${run}`);
  await expect(form.getByLabel("4 / 5")).toBeChecked();

  await message.fill(`Bonus kartım eklenmiyor ${run}`);
  await form.getByRole("button", { name: "Gönder" }).click();
  await expect(form.getByRole("status")).toHaveText("Teşekkürler, mesajın bize ulaştı.");
  await expect(message).toHaveValue("");
  const mine = page.getByRole("region", { name: "Gönderdiklerin" });
  await expect(mine.getByRole("listitem").first()).toContainText(`Bonus kartım eklenmiyor ${run}`);
  await expect(mine.getByRole("listitem").first()).toContainText("Gönderildi");

  // API: geçerli 201, geçersiz 400.
  const api = page.request;
  const created = await api.post("/api/me/feedback", {
    data: { kind: "IDEA", message: `API fikri ${run}` },
  });
  expect(created.status()).toBe(201);
  expect(await created.json()).toMatchObject({ kind: "IDEA", status: "NEW", rating: null });
  expect(
    (await api.post("/api/me/feedback", { data: { kind: "IDEA", message: "x" } })).status(),
  ).toBe(400);
  const list = (await (await api.get("/api/me/feedback")).json()) as { feedback: unknown[] };
  expect(list.feedback).toHaveLength(2);

  // Admin gelen kutusu.
  await page.goto("/admin/geri-bildirim");
  await expect(page.getByRole("heading", { name: "Sayfa bulunamadı" })).toBeVisible();
  await makeAdmin(email);
  await page.goto("/admin/geri-bildirim");
  const item = page.getByRole("article").filter({ hasText: `Bonus kartım eklenmiyor ${run}` });
  await expect(item).toContainText("Bir şey çalışmıyor");
  await expect(item).toContainText("Puan: 4/5");
  await expect(item).toContainText("Sayfa: /kartlarim");
  await expect(item.getByRole("link", { name: email })).toHaveAttribute("href", `mailto:${email}`);
  await item.getByRole("button", { name: "Okundu olarak işaretle" }).click();
  await expect(item).toHaveCount(0);
  await page.getByRole("link", { name: /^Okundu/ }).click();
  await expect(
    page.getByRole("article").filter({ hasText: `Bonus kartım eklenmiyor ${run}` }),
  ).toBeVisible();

  await page.goto("/geri-bildirim");
  await expect(
    page.getByRole("region", { name: "Gönderdiklerin" }).getByText("Ekip okudu"),
  ).toBeVisible();
});
