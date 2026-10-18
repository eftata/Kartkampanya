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
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Axess kartını kaldır" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("list", { name: "Eklenen kartlar" }).getByRole("listitem"),
  ).toHaveCount(1);

  await page.getByRole("link", { name: "Devam et" }).click();
  await expect(page).toHaveURL("/baslangic/harcama");

  // Harcama profili tamamlanmadan plan açılmaz.
  await page.goto("/plan");
  await expect(page).toHaveURL("/baslangic/harcama");

  // Adım 2: harcama profili
  const save = page.getByRole("button", { name: "Kaydet ve planımı gör" });
  await expect(save).toBeDisabled();

  await page.getByRole("button", { name: "Market", exact: true }).click();
  const market = page.getByRole("region", { name: "Market" });
  await market.getByLabel("Market aylık tutar (TL)").fill("6000");
  await market.getByRole("button", { name: "Migros" }).click();
  await expect(market.getByRole("button", { name: "Migros" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: "Akaryakıt", exact: true }).click();
  await page.getByLabel("Akaryakıt aylık tutar (TL)").fill("3000");

  // Seçilip vazgeçilen kategori profile girmez.
  await page.getByRole("button", { name: "Giyim", exact: true }).click();
  await page.getByRole("button", { name: "Giyim", exact: true }).click();
  await expect(page.getByRole("region", { name: "Giyim" })).toHaveCount(0);

  await expect(page.getByTestId("spend-total")).toHaveText("₺9.000");

  // Sıfır tutar reddedilir.
  await page.getByLabel("Akaryakıt aylık tutar (TL)").fill("0");
  await save.click();
  await expect(page.getByRole("alert").filter({ hasText: "aylık tutar gir" })).toBeVisible();
  await page.getByLabel("Akaryakıt aylık tutar (TL)").fill("3000");

  await save.click();
  await expect(page).toHaveURL("/plan");
  await expect(page.getByRole("heading", { name: "Bu ayın planı" })).toBeVisible();

  // Kaydedilen profil geri yüklenir.
  await page.goto("/baslangic/harcama");
  await expect(page.getByLabel("Market aylık tutar (TL)")).toHaveValue("6000");
  await expect(page.getByLabel("Akaryakıt aylık tutar (TL)")).toHaveValue("3000");
  await expect(
    page.getByRole("region", { name: "Market" }).getByRole("button", { name: "Migros" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("spend-total")).toHaveText("₺9.000");
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

test("harcama profili API'leri: kategoriler açık, profil oturum ister ve doğrulanır", async ({
  page,
  request,
}) => {
  const res = await request.get("/api/catalog/categories");
  expect(res.status()).toBe(200);
  const { categories } = (await res.json()) as {
    categories: { id: string; slug: string; merchants: { id: string; name: string }[] }[];
  };
  expect(categories.map((c) => c.slug)).toEqual(
    expect.arrayContaining(["akaryakit", "e-ticaret", "giyim", "market", "restoran", "seyahat"]),
  );
  const market = categories.find((c) => c.slug === "market")!;
  const fuel = categories.find((c) => c.slug === "akaryakit")!;

  expect((await request.get("/api/me/spend-profile")).status()).toBe(401);
  expect((await request.put("/api/me/spend-profile", { data: { items: [] } })).status()).toBe(401);

  await signUp(page);
  const api = page.request;
  expect(await (await api.get("/api/me/spend-profile")).json()).toEqual({
    items: [],
    totalKurus: 0,
  });

  expect((await api.put("/api/me/spend-profile", { data: { items: [] } })).status()).toBe(400);
  const wrongMerchant = await api.put("/api/me/spend-profile", {
    data: {
      items: [
        { categoryId: fuel.id, monthlyKurus: 100_000, merchantIds: [market.merchants[0]!.id] },
      ],
    },
  });
  expect(wrongMerchant.status()).toBe(400);

  const saved = await api.put("/api/me/spend-profile", {
    data: {
      items: [
        { categoryId: market.id, monthlyKurus: 600_000, merchantIds: [market.merchants[0]!.id] },
        { categoryId: fuel.id, monthlyKurus: 300_000 },
      ],
    },
  });
  expect(saved.status()).toBe(200);
  const profile = (await saved.json()) as { totalKurus: number; items: { categorySlug: string }[] };
  expect(profile.totalKurus).toBe(900_000);
  expect(profile.items.map((i) => i.categorySlug).sort()).toEqual(["akaryakit", "market"]);
});
