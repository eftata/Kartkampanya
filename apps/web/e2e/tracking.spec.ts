import { expect, test } from "@playwright/test";

import { createDraftCampaign, currentMonth, deleteCampaigns, signUp } from "./helpers";

type Banks = { banks: { programs: { slug: string; cards: { id: string }[] }[] }[] };
type Categories = { categories: { id: string; slug: string }[] };

test("harcama girişi: eşik ilerlemesi ve kalan bütçeyle plan", async ({ page }) => {
  const run = Date.now().toString(36);
  const { first, last } = currentMonth();
  const title = `E2E restoran ${run}`;
  // Maximum + restoran: diğer plan testlerinin kampanyalarıyla (Bonus/World) çakışmaz.
  // Her 1.000 TL'ye 50 TL, en fazla 300 TL.
  const ids = [
    await createDraftCampaign(title, {
      status: "APPROVED",
      categorySlug: "restoran",
      programSlug: "maximum",
      thresholdKurus: 100_000,
      rewardKurus: 5_000,
      startsAt: first,
      endsAt: last,
    }),
  ];
  try {
    await signUp(page);
    const api = page.request;
    const { banks } = (await (await api.get("/api/catalog/banks")).json()) as Banks;
    const maximum = banks.flatMap((b) => b.programs).find((p) => p.slug === "maximum")!;
    expect(
      (await api.post("/api/me/cards", { data: { cardProductId: maximum.cards[0]!.id } })).status(),
    ).toBe(201);
    const { categories } = (await (await api.get("/api/catalog/categories")).json()) as Categories;
    const restoran = categories.find((c) => c.slug === "restoran")!.id;
    await api.put("/api/me/spend-profile", {
      data: { items: [{ categoryId: restoran, monthlyKurus: 300_000 }] },
    });

    // Harcama yokken plan ayın tamamı için; ilerleme sıfır.
    await page.goto("/plan");
    const tracking = page.getByRole("region", { name: "Kampanya ilerlemen" });
    await expect(tracking).toContainText(title);
    await expect(tracking).toContainText("₺0 / ₺1.000");
    await expect(tracking).not.toContainText("harcama girdin");

    await tracking.getByRole("link", { name: "Harcama ekle" }).click();
    await expect(page).toHaveURL("/harcamalar");
    const form = page.getByRole("form", { name: "Harcama ekle" });
    await form.getByLabel("Kategori").selectOption({ label: "Restoran ve kafe" });
    await form.getByLabel("Tutar (TL)").fill("altı yüz");
    await form.getByRole("button", { name: "Harcamayı ekle" }).click();
    await expect(form.getByRole("alert")).toContainText("Tutarı TL olarak yaz");
    await expect(form.getByLabel("Tutar (TL)")).toHaveValue("altı yüz");

    await form.getByLabel("Tutar (TL)").fill("600");
    await form.getByRole("button", { name: "Harcamayı ekle" }).click();
    await expect(form.getByRole("status")).toContainText("Eklendi");
    await expect(form.getByLabel("Tutar (TL)")).toHaveValue("");
    await expect(page.getByRole("region", { name: "Bu ay kategori bazında" })).toContainText(
      "₺600 / ₺3.000",
    );

    // Plan ayın kalanı için; eşiğe 400 TL kaldı.
    await page.goto("/plan");
    await expect(tracking).toContainText("Bu ay ₺600 harcama girdin");
    await expect(tracking).toContainText("₺600 / ₺1.000 · ₺400 kaldı");

    // API ile ikinci harcama: ilk kademe kazanıldı.
    const card = (await (await api.get("/api/me/cards")).json()) as { cards: { id: string }[] };
    const created = await api.post("/api/me/transactions", {
      data: {
        userCardId: card.cards[0]!.id,
        categoryId: restoran,
        amountKurus: 50_000,
        date: (await (await api.get("/api/me/transactions")).json()).transactions[0].date,
      },
    });
    expect(created.status()).toBe(201);
    const list = (await (await api.get("/api/me/transactions")).json()) as {
      transactions: { id: string }[];
    };
    expect(list.transactions).toHaveLength(2);
    await page.goto("/plan");
    await expect(tracking).toContainText("₺1.100 / ₺2.000 · ₺900 kaldı · şimdiye kadar ~₺50");
    await expect(tracking).toContainText("kampanyalardan ~₺50 kazandın");

    // Silme (API).
    expect((await api.delete(`/api/me/transactions/${list.transactions[0]!.id}`)).status()).toBe(
      204,
    );
    expect((await api.delete(`/api/me/transactions/${list.transactions[0]!.id}`)).status()).toBe(
      404,
    );
    await page.goto("/harcamalar");
    await expect(
      page.getByRole("region", { name: "Bu ayın harcamaları" }).getByRole("row"),
    ).toHaveCount(2); // başlık + 1 harcama
  } finally {
    await deleteCampaigns(ids);
  }
});
