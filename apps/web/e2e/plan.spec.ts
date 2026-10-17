import { expect, test } from "@playwright/test";

import { createDraftCampaign, currentMonth, deleteCampaigns, signUp } from "./helpers";

type Banks = { banks: { programs: { slug: string; cards: { id: string }[] }[] }[] };
type Categories = { categories: { id: string; slug: string }[] };

test("bu ayın planı: kart dağılımı, kampanyalar, tek kart kıyası ve katılım", async ({ page }) => {
  const run = Date.now().toString(36);
  const { first, last } = currentMonth();
  const market = `E2E plan market ${run}`;
  const fuel = `E2E plan akaryakıt ${run}`;
  const ids = [
    // Bonus: markette her 2.500 TL'ye 100 TL (en fazla 300 TL)
    await createDraftCampaign(market, {
      status: "APPROVED",
      categorySlug: "market",
      startsAt: first,
      endsAt: last,
    }),
    // World: akaryakıtta her 1.000 TL'ye 50 TL
    await createDraftCampaign(fuel, {
      status: "APPROVED",
      categorySlug: "akaryakit",
      programSlug: "world",
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
    const programs = banks.flatMap((b) => b.programs);
    for (const slug of ["bonus", "world"]) {
      const cardProductId = programs.find((p) => p.slug === slug)!.cards[0]!.id;
      expect((await api.post("/api/me/cards", { data: { cardProductId } })).status()).toBe(201);
    }
    const { categories } = (await (await api.get("/api/catalog/categories")).json()) as Categories;
    const id = (slug: string) => categories.find((c) => c.slug === slug)!.id;
    await api.put("/api/me/spend-profile", {
      data: {
        items: [
          { categoryId: id("market"), monthlyKurus: 400_000 },
          { categoryId: id("akaryakit"), monthlyKurus: 200_000 },
        ],
      },
    });

    await page.goto("/plan");
    await expect(page.getByRole("heading", { name: "Bu ayın planı" })).toBeVisible();

    // Seed oranları 0 (doğrulanmadı): kazanç yalnızca kampanyalardan.
    // Market 4.000 TL → Bonus: 1 kademe = 100 TL · Akaryakıt 2.000 TL → World: 2 kademe = 100 TL
    await expect(page.getByRole("group", { name: "Beklenen kazanç" })).toContainText("₺200");
    await expect(page.getByRole("group", { name: "Her şeyi tek kartla ödeseydin" })).toContainText(
      "₺100",
    );
    await expect(page.getByRole("group", { name: "Plan sayesinde fazladan" })).toContainText(
      "+₺100",
    );

    const table = page.getByRole("region", { name: "Harcama dağılımı" });
    const marketRow = table.getByRole("row").filter({ hasText: market });
    await expect(marketRow).toContainText("Market");
    await expect(marketRow).toContainText("₺4.000");
    const fuelRow = table.getByRole("row").filter({ hasText: fuel });
    await expect(fuelRow).toContainText("₺2.000");
    await expect(fuelRow).toContainText("₺100");

    // Az kaldı: markette bir sonraki kademe için 1.000 TL
    await expect(page.getByRole("region", { name: "Yakın kampanyalar" })).toContainText(
      "₺1.000 daha harcarsan +₺100",
    );
    await expect(page.getByText("Bazı kartlarının temel kazanç oranları")).toBeVisible();

    // Plan katılım gerektiren kampanyaya dayanıyor: buradan işaretlenebilir.
    const join = page.getByRole("region", { name: "Katılman gereken kampanyalar" });
    const row = join.getByRole("listitem").filter({ hasText: market });
    await row.getByRole("button", { name: "Katıldım olarak işaretle" }).click();
    await expect(join.getByRole("listitem").filter({ hasText: market })).toHaveCount(0);

    await marketRow.getByRole("link", { name: market }).click();
    await expect(page).toHaveURL(`/kampanyalarim/${ids[0]}`);
  } finally {
    await deleteCampaigns(ids);
  }
});
