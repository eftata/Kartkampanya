import { expect, test } from "@playwright/test";

import { createDraftCampaign, deleteCampaigns, signUp } from "./helpers";

type Banks = { banks: { programs: { slug: string; cards: { id: string }[] }[] }[] };
type Categories = { categories: { id: string; slug: string }[] };
type Campaigns = {
  campaigns: { id: string; upcoming: boolean; joined: boolean; cards: { id: string }[] }[];
};

test("kişisel kampanya API'si yalnızca kullanıcının kartına ve alanına uyanları döner", async ({
  page,
  request,
}) => {
  expect((await request.get("/api/me/campaigns")).status()).toBe(401);
  expect((await request.patch("/api/me/campaigns/x", { data: { joined: true } })).status()).toBe(
    401,
  );

  const run = Date.now().toString(36);
  const ids = [
    await createDraftCampaign(`E2E market ${run}`, { status: "APPROVED", categorySlug: "market" }),
    await createDraftCampaign(`E2E giyim ${run}`, { status: "APPROVED", categorySlug: "giyim" }),
    await createDraftCampaign(`E2E taslak ${run}`, { categorySlug: "market" }),
  ];
  try {
    await signUp(page);
    const api = page.request;
    // Kart ve profil yokken liste boş.
    expect(((await (await api.get("/api/me/campaigns")).json()) as Campaigns).campaigns).toEqual(
      [],
    );

    const { banks } = (await (await api.get("/api/catalog/banks")).json()) as Banks;
    const bonus = banks.flatMap((b) => b.programs).find((p) => p.slug === "bonus")!;
    const created = await api.post("/api/me/cards", {
      data: { cardProductId: bonus.cards[0]!.id },
    });
    const { card } = (await created.json()) as { card: { id: string } };
    const { categories } = (await (await api.get("/api/catalog/categories")).json()) as Categories;
    const market = categories.find((c) => c.slug === "market")!;
    await api.put("/api/me/spend-profile", {
      data: { items: [{ categoryId: market.id, monthlyKurus: 400_000 }] },
    });

    const res = await api.get(`/api/me/campaigns?card=${card.id}&category=&sort=gain`);
    expect(res.status()).toBe(200);
    const mine = ((await res.json()) as Campaigns).campaigns.filter((c) => ids.includes(c.id));
    expect(mine.map((c) => c.id)).toEqual([ids[0]]);
    expect(mine[0]).toMatchObject({ upcoming: true, cards: [{ id: card.id }] });

    // "Katıldım" işareti: doğrulama, taslak kampanya bulunamaz, onaylıda işaret listeye yansır.
    expect((await api.patch(`/api/me/campaigns/${ids[0]}`, { data: {} })).status()).toBe(400);
    expect(
      (await api.patch(`/api/me/campaigns/${ids[2]}`, { data: { joined: true } })).status(),
    ).toBe(404);
    const patched = await api.patch(`/api/me/campaigns/${ids[0]}`, { data: { joined: true } });
    expect(await patched.json()).toEqual({ joined: true, inPlan: false });
    const after = ((await (await api.get("/api/me/campaigns")).json()) as Campaigns).campaigns;
    expect(after.find((c) => c.id === ids[0])).toMatchObject({ joined: true });

    expect((await api.get("/api/me/campaigns?sort=en-iyi")).status()).toBe(400);
    expect((await api.get("/api/me/campaigns?type=HEDIYE")).status()).toBe(400);
  } finally {
    await deleteCampaigns(ids);
  }
});

test("kampanyalar sayfası: etiketler, filtre, sıralama ve temizleme", async ({ page }) => {
  const run = Date.now().toString(36);
  const points = `E2E puan ${run}`;
  const cashback = `E2E iade ${run}`;
  const ids = [
    await createDraftCampaign(points, { status: "APPROVED", categorySlug: "market" }),
    await createDraftCampaign(cashback, {
      status: "APPROVED",
      categorySlug: "market",
      rewardType: "CASHBACK",
      rewardKurus: 5_000,
    }),
    await createDraftCampaign(`E2E giyim ${run}`, { status: "APPROVED", categorySlug: "giyim" }),
  ];
  try {
    await signUp(page);
    await page.goto("/kampanyalarim");
    await expect(page.getByRole("link", { name: "Kartlarını ekle" })).toBeVisible();

    const api = page.request;
    const { banks } = (await (await api.get("/api/catalog/banks")).json()) as Banks;
    const bonus = banks.flatMap((b) => b.programs).find((p) => p.slug === "bonus")!;
    await api.post("/api/me/cards", { data: { cardProductId: bonus.cards[0]!.id } });
    const { categories } = (await (await api.get("/api/catalog/categories")).json()) as Categories;
    const market = categories.find((c) => c.slug === "market")!;
    await api.put("/api/me/spend-profile", {
      data: { items: [{ categoryId: market.id, monthlyKurus: 400_000 }] },
    });

    await page.goto("/kampanyalarim");
    // Paralel testlerin kampanyaları da görünebilir: yalnızca bu testinkiler sayılır.
    const mine = page.getByRole("article").filter({ visible: true }).filter({ hasText: run });
    const titles = mine.getByRole("heading");
    await expect(titles).toHaveText([cashback, points]); // aynı bitiş: başlığa göre
    await expect(page.getByText(`E2E giyim ${run}`)).toHaveCount(0);

    const card = mine.filter({ hasText: points });
    await expect(card.getByRole("list", { name: "Etiketler" })).toContainText(
      "Katılım gerekli · Mobil uygulamadan",
    );
    await expect(card.getByRole("list", { name: "Etiketler" })).toContainText("Başlangıç:");
    await expect(card).toContainText("~₺100");
    await expect(card.getByRole("link", { name: /Bankanın kampanya sayfası/ })).toHaveAttribute(
      "href",
      /ornek-banka\.test/,
    );

    // Katıldım: etiket değişir, yenilemeden sonra da kalır, geri alınabilir.
    const join = card.getByRole("button", { name: "Katıldım olarak işaretle" });
    await join.click();
    await expect(card.getByRole("button", { name: "✓ Katıldım" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(card.getByRole("list", { name: "Etiketler" })).toContainText("Katıldın");
    await page.reload();
    await expect(card.getByRole("list", { name: "Etiketler" })).toContainText("Katıldın");
    await card.getByRole("button", { name: "✓ Katıldım" }).click();
    await expect(card.getByRole("list", { name: "Etiketler" })).toContainText("Katılım gerekli");

    const filters = page.getByRole("form", { name: "Kampanya filtreleri" });
    await filters.getByLabel("Sırala").selectOption("kazanc");
    await expect(page).toHaveURL(/sirala=kazanc/);
    await expect(titles).toHaveText([points, cashback]); // ₺100 > ₺50

    await filters.getByLabel("Fayda").selectOption("iade");
    await expect(page).toHaveURL(/tur=iade/);
    await expect(titles).toHaveText([cashback]);

    await page.getByRole("link", { name: "Filtreleri temizle" }).click();
    await expect(page).toHaveURL("/kampanyalarim");
    await expect(titles).toHaveText([cashback, points]);
    await expect(filters.getByLabel("Fayda")).toHaveValue("");
  } finally {
    await deleteCampaigns(ids);
  }
});

test("kampanya detayı: özet, sade koşullar, katılım ve kaynak", async ({ page }) => {
  const run = Date.now().toString(36);
  const title = `E2E detay ${run}`;
  const ids = [
    await createDraftCampaign(title, { status: "APPROVED", categorySlug: "market" }),
    await createDraftCampaign(`E2E detay taslak ${run}`, { categorySlug: "market" }),
  ];
  try {
    await signUp(page);
    const api = page.request;
    const { banks } = (await (await api.get("/api/catalog/banks")).json()) as Banks;
    const bonus = banks.flatMap((b) => b.programs).find((p) => p.slug === "bonus")!;
    await api.post("/api/me/cards", { data: { cardProductId: bonus.cards[0]!.id } });
    const { categories } = (await (await api.get("/api/catalog/categories")).json()) as Categories;
    const market = categories.find((c) => c.slug === "market")!;
    await api.put("/api/me/spend-profile", {
      data: { items: [{ categoryId: market.id, monthlyKurus: 400_000 }] },
    });

    await page.goto("/kampanyalarim");
    await page.getByRole("link", { name: title }).click();
    await expect(page).toHaveURL(`/kampanyalarim/${ids[0]}`);
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();

    await expect(page.getByRole("region", { name: "Özet" })).toContainText(
      "Markette toplam 2.500 TL harcamaya 100 TL puan",
    );
    const terms = page.getByRole("region", { name: "Koşullar" });
    await expect(terms).toContainText("Her ₺2.500 harcamaya ₺100 puan");
    await expect(terms).toContainText("Geçerli: Market");
    await expect(terms).toContainText("En fazla ₺300");
    await expect(terms).toContainText("Hariç: taksitli işlemler");
    await expect(terms).toContainText("Bonus programındaki tüm kartlar");

    const forYou = page.getByRole("region", { name: "Senin için" });
    await expect(forYou).toContainText("Harcama alanların: Market");
    await expect(forYou).toContainText("~₺100");

    const dates = page.getByRole("region", { name: "Tarihler ve katılım" });
    await expect(dates).toContainText("Katılım: Mobil uygulamadan");
    await dates.getByRole("button", { name: "Katıldım olarak işaretle" }).click();
    await expect(page.getByRole("list", { name: "Etiketler" })).toContainText("Katıldın");

    await expect(
      page.getByRole("region", { name: "Kaynak" }).getByRole("link", { name: /Bankanın/ }),
    ).toHaveAttribute("href", /ornek-banka\.test/);

    // Taslak kampanyanın varlığı sızmaz.
    await page.goto(`/kampanyalarim/${ids[1]}`);
    await expect(page.getByRole("heading", { name: "Sayfa bulunamadı" })).toBeVisible();
  } finally {
    await deleteCampaigns(ids);
  }
});
