import { expect, test } from "@playwright/test";

import { signUp } from "./helpers";

// Önkoşul: katalog seed'i yüklü (`pnpm db:seed`).

test("yeni kullanıcı kartlarını ekler, düzeltir ve plana geçer", async ({ page }) => {
  await signUp(page);
  await expect(page).toHaveURL("/baslangic");
  await expect(page.getByRole("heading", { name: "Kartlarını ekle" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Devam et" })).toBeDisabled();

  // Banka → (tek program, atlanır) → kart → ayrıntılar
  await page.getByRole("button", { name: /^Garanti BBVA/ }).click();
  await expect(page.getByText("Bonus: hangi kart?")).toBeVisible();
  await page.getByRole("button", { name: "Bonus Platinum" }).click();

  // Kart numarası hiçbir alanda kabul edilmez.
  await page.getByLabel("Kartın adı (isteğe bağlı)").fill("4111 1111 1111 1111");
  await page.getByRole("button", { name: "Kartı ekle" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Kart numarası girmeyin" })).toBeVisible();

  await page.getByLabel("Kartın adı (isteğe bağlı)").fill("Maaş kartım");
  await page.getByLabel("Kart limiti, TL (isteğe bağlı)").fill("50.000");
  await page.getByLabel("Hesap kesim günü (isteğe bağlı)").selectOption("15");
  await page.getByRole("button", { name: "Kartı ekle" }).click();
  await expect(page.getByRole("status")).toHaveText("Bonus Platinum eklendi.");

  const list = page.getByRole("list", { name: "Eklenen kartlar" });
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list).toContainText("Maaş kartım");
  await expect(list).toContainText("Garanti BBVA · Bonus Platinum · Limit ₺50.000 · Kesim 15");

  // İkinci kart, ayrıntısız
  await page.getByRole("button", { name: /^Akbank/ }).click();
  await page.getByRole("button", { name: "Axess", exact: true }).click();
  await page.getByRole("button", { name: "Kartı ekle" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(2);

  // Eklenen kart tekrar seçilemez
  await page.getByRole("button", { name: /^Garanti BBVA/ }).click();
  await expect(page.getByRole("button", { name: "Bonus Platinum Ekli" })).toBeDisabled();
  await page.getByRole("button", { name: "Başka banka seç" }).click();

  // Kaldır ve yenile: kalıcı
  await page.getByRole("button", { name: "Axess kartını kaldır" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("list", { name: "Eklenen kartlar" }).getByRole("listitem"),
  ).toHaveCount(1);

  await page.getByRole("link", { name: "Devam et" }).click();
  await expect(page).toHaveURL("/plan");
  await expect(page.getByRole("heading", { name: "Bu ayın planı" })).toBeVisible();
});

test("kart API'leri: katalog açık, /api/me oturum ister ve girdiyi doğrular", async ({
  page,
  request,
}) => {
  const catalog = await request.get("/api/catalog/banks");
  expect(catalog.status()).toBe(200);
  const { banks } = (await catalog.json()) as { banks: { name: string; programs: unknown[] }[] };
  expect(banks.map((b) => b.name)).toEqual(
    expect.arrayContaining([
      "Akbank",
      "Garanti BBVA",
      "Halkbank",
      "Türkiye İş Bankası",
      "Yapı Kredi",
    ]),
  );

  expect((await request.get("/api/me/cards")).status()).toBe(401);
  expect((await request.post("/api/me/cards", { data: {} })).status()).toBe(401);

  await signUp(page);
  const api = page.request;
  const bonus = banks.find((b) => b.name === "Garanti BBVA") as unknown as {
    programs: { cards: { id: string; name: string }[] }[];
  };
  const cardProductId = bonus.programs[0]!.cards[0]!.id;

  const bad = await api.post("/api/me/cards", {
    data: { cardProductId, nickname: "4111-1111-1111-1111" },
  });
  expect(bad.status()).toBe(400);

  const created = await api.post("/api/me/cards", { data: { cardProductId, statementDay: 3 } });
  expect(created.status()).toBe(201);
  const { card } = (await created.json()) as { card: { id: string; statementDay: number } };
  expect(card.statementDay).toBe(3);

  expect((await api.post("/api/me/cards", { data: { cardProductId } })).status()).toBe(409);
  expect((await api.post("/api/me/cards", { data: { cardProductId: "yok" } })).status()).toBe(400);

  const list = (await (await api.get("/api/me/cards")).json()) as { cards: unknown[] };
  expect(list.cards).toHaveLength(1);
  expect((await api.delete(`/api/me/cards/${card.id}`)).status()).toBe(204);
  expect((await api.delete(`/api/me/cards/${card.id}`)).status()).toBe(404);
});
