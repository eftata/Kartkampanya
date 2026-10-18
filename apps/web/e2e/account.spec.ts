import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

import { signUp } from "./helpers";

// Önkoşul: katalog seed'i yüklü (`pnpm db:seed`).

type Catalog = { banks: { name: string; programs: { cards: { id: string; name: string }[] }[] }[] };
type Categories = { categories: { id: string; slug: string; merchants: { id: string }[] }[] };

async function cardId(api: APIRequestContext, bankName: string, cardName: string) {
  const { banks } = (await (await api.get("/api/catalog/banks")).json()) as Catalog;
  const card = banks
    .find((b) => b.name === bankName)
    ?.programs.flatMap((p) => p.cards)
    .find((c) => c.name === cardName);
  if (!card) throw new Error(`${bankName} / ${cardName} katalogda yok`);
  return card.id;
}

test("Kartlarım: kartı düzenler, değerleri temizler, ekler ve kaldırır", async ({ page }) => {
  await signUp(page);
  const api = page.request;
  await api.post("/api/me/cards", {
    data: {
      cardProductId: await cardId(api, "Garanti BBVA", "Bonus Platinum"),
      nickname: "Maaş kartım",
      limitKurus: 5_000_000,
      statementDay: 15,
    },
  });

  await page.goto("/kartlarim");
  await expect(page.getByRole("heading", { name: "Kartlarım", level: 1 })).toBeVisible();
  const list = page.getByRole("list", { name: "Eklenen kartlar" });
  await expect(list).toContainText("Garanti BBVA · Bonus Platinum · Limit ₺50.000 · Kesim 15");

  await page.getByRole("button", { name: "Bonus Platinum kartını düzenle" }).click();
  const form = page.getByRole("form", { name: "Bonus Platinum düzenle" });
  await expect(form.getByLabel("Kart limiti, TL (isteğe bağlı)")).toHaveValue("50.000");

  // Kart numarası düzenlemede de reddedilir.
  await form.getByLabel("Kartın adı (isteğe bağlı)").fill("5500 0000 0000 0004");
  await form.getByRole("button", { name: "Kaydet" }).click();
  await expect(form.getByRole("alert")).toContainText("Kart numarası girmeyin");

  await form.getByLabel("Kartın adı (isteğe bağlı)").fill("Market kartı");
  await form.getByLabel("Kart limiti, TL (isteğe bağlı)").fill("");
  await form.getByLabel("Hesap kesim günü (isteğe bağlı)").selectOption("20");
  await form.getByRole("button", { name: "Kaydet" }).click();
  await expect(form).toHaveCount(0);
  await expect(list).toContainText("Market kartı");
  await expect(list).toContainText("Garanti BBVA · Bonus Platinum · Kesim 20");
  await expect(list).not.toContainText("Limit");

  // Sihirbazla ikinci kart
  await page.getByRole("button", { name: /^Yapı Kredi/ }).click();
  await page.getByRole("button", { name: "Worldcard", exact: true }).click();
  await page.getByRole("button", { name: "Kartı ekle" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(2);

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Worldcard kartını kaldır" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);

  await page.reload();
  const reloaded = page.getByRole("list", { name: "Eklenen kartlar" });
  await expect(reloaded.getByRole("listitem")).toHaveCount(1);
  await expect(reloaded).toContainText("Market kartı");
  await expect(reloaded).toContainText("Kesim 20");
});

test("Profilim: harcama profilini günceller ve sayfada kalır", async ({ page }) => {
  const email = `profil-${Date.now()}@kartplan.test`;
  await signUp(page, email);
  const api = page.request;
  const { categories } = (await (await api.get("/api/catalog/categories")).json()) as Categories;
  const id = (slug: string) => categories.find((c) => c.slug === slug)!.id;
  await api.put("/api/me/spend-profile", {
    data: {
      items: [
        { categoryId: id("market"), monthlyKurus: 600_000 },
        { categoryId: id("akaryakit"), monthlyKurus: 300_000 },
      ],
    },
  });

  await page.goto("/profil");
  // E-posta "Hesap" kartında görünür (kapalı "Hesabımı sil" bölümündeki onay metni sayılmaz).
  await expect(page.getByRole("main").getByText(email).filter({ visible: true })).toBeVisible();
  await expect(page.getByLabel("Market aylık tutar (TL)")).toHaveValue("6000");
  await expect(page.getByTestId("spend-total")).toHaveText("₺9.000");

  await page.getByLabel("Market aylık tutar (TL)").fill("7500");
  await page.getByRole("button", { name: "Akaryakıt", exact: true }).click();
  await page.getByRole("button", { name: "E-ticaret", exact: true }).click();
  await page.getByLabel("E-ticaret aylık tutar (TL)").fill("2000");
  await expect(page.getByTestId("spend-total")).toHaveText("₺9.500");

  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Harcama profilin kaydedildi.");
  await expect(page).toHaveURL("/profil");

  await page.reload();
  await expect(page.getByLabel("Market aylık tutar (TL)")).toHaveValue("7500");
  await expect(page.getByLabel("E-ticaret aylık tutar (TL)")).toHaveValue("2000");
  await expect(page.getByLabel("Akaryakıt aylık tutar (TL)")).toHaveCount(0);
  await expect(page.getByTestId("spend-total")).toHaveText("₺9.500");
});

test("PATCH /api/me/cards/{id}: oturum, doğrulama ve sahiplik", async ({ page, request }) => {
  expect((await request.patch("/api/me/cards/x", { data: {} })).status()).toBe(401);

  await signUp(page);
  const api = page.request;
  const created = await api.post("/api/me/cards", {
    data: { cardProductId: await cardId(api, "Akbank", "Axess"), statementDay: 3 },
  });
  const { card } = (await created.json()) as { card: { id: string } };

  const patched = await api.patch(`/api/me/cards/${card.id}`, { data: { limitKurus: 2_000_000 } });
  expect(patched.status()).toBe(200);
  expect(((await patched.json()) as { card: object }).card).toMatchObject({
    limitKurus: 2_000_000,
    statementDay: 3,
  });

  const cleared = await api.patch(`/api/me/cards/${card.id}`, { data: { statementDay: null } });
  expect(((await cleared.json()) as { card: object }).card).toMatchObject({ statementDay: null });

  // Kart türü değiştirilemez, kart numarası kabul edilmez, başkasının/olmayan kart 404.
  expect(
    (await api.patch(`/api/me/cards/${card.id}`, { data: { cardProductId: "x" } })).status(),
  ).toBe(400);
  expect(
    (
      await api.patch(`/api/me/cards/${card.id}`, { data: { nickname: "4111111111111111" } })
    ).status(),
  ).toBe(400);
  expect((await api.patch("/api/me/cards/olmayan", { data: { limitKurus: 1 } })).status()).toBe(
    404,
  );
});
