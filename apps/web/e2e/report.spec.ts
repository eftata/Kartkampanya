import { expect, test } from "@playwright/test";

import { createDraftCampaign, deleteCampaigns, signUp } from "./helpers";

type Banks = { banks: { programs: { slug: string; cards: { id: string }[] }[] }[] };
type Categories = { categories: { id: string; slug: string }[] };

/** Geçen ay (Türkiye takvimi): ilk gün, 15'i ve son gün. */
function lastMonth() {
  const today = new Date(Date.now() + 3 * 3_600_000);
  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
  const day = (date: Date) => date.toISOString().slice(0, 10);
  return {
    month: day(first).slice(0, 7),
    first: day(first),
    mid: `${day(first).slice(0, 8)}15`,
    last: day(last),
  };
}

test("ay sonu raporu: geçen ay biten kampanyalardan kazanılan ve kaçırılan", async ({ page }) => {
  const run = Date.now().toString(36);
  const { month, first, mid, last } = lastMonth();
  // Axess + giyim: diğer testlerin güncel ay kampanyalarıyla çakışmaz (geçen ay bitti).
  const won = `E2E rapor kazanılan ${run}`;
  const lost = `E2E rapor kaçırılan ${run}`;
  const ids = [
    await createDraftCampaign(won, {
      status: "APPROVED",
      programSlug: "axess",
      categorySlug: "giyim",
      thresholdKurus: 100_000,
      rewardKurus: 7_500,
      startsAt: first,
      endsAt: last,
    }),
    await createDraftCampaign(lost, {
      status: "APPROVED",
      programSlug: "axess",
      categorySlug: "giyim",
      thresholdKurus: 500_000,
      rewardKurus: 25_000,
      startsAt: first,
      endsAt: last,
    }),
  ];
  try {
    await signUp(page);
    const api = page.request;
    const { banks } = (await (await api.get("/api/catalog/banks")).json()) as Banks;
    const axess = banks.flatMap((b) => b.programs).find((p) => p.slug === "axess")!;
    const { card } = (await (
      await api.post("/api/me/cards", { data: { cardProductId: axess.cards[0]!.id } })
    ).json()) as { card: { id: string } };
    const { categories } = (await (await api.get("/api/catalog/categories")).json()) as Categories;
    const giyim = categories.find((c) => c.slug === "giyim")!.id;
    expect(
      (
        await api.post("/api/me/transactions", {
          data: { userCardId: card.id, categoryId: giyim, amountKurus: 120_000, date: mid },
        })
      ).status(),
    ).toBe(201);

    await page.goto("/plan/rapor");
    await expect(page.getByRole("heading", { name: "Ay sonu raporu" })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Aylar" }).locator('[aria-current="page"]'),
    ).toBeVisible();
    // Kampanya katılım istiyor: harcama tuttu ama katılınmadığı için kaçırıldı.
    const missed = page.getByRole("region", { name: "Kaçırdıkların" });
    await expect(missed.getByRole("listitem").filter({ hasText: won })).toContainText(
      "kampanyaya katılmadın",
    );
    expect((await api.patch(`/api/me/campaigns/${ids[0]}`, { data: { joined: true } })).ok()).toBe(
      true,
    );
    await page.reload();
    await expect(page.getByRole("group", { name: "Kazandığın (tahmini)" })).toContainText("₺75");
    await expect(page.getByRole("region", { name: "Kazandıkların" })).toContainText(won);
    await expect(missed.getByRole("listitem").filter({ hasText: lost })).toContainText(
      "Eşiğe ₺3.800 kaldı.",
    );

    const report = (await (await api.get(`/api/me/report?month=${month}`)).json()) as {
      month: string;
      closed: boolean;
      campaignEarnedKurus: number;
      missed: { title: string; reason: string }[];
    };
    expect(report).toMatchObject({ month, closed: true, campaignEarnedKurus: 7_500 });
    expect(report.missed).toContainEqual(
      expect.objectContaining({ title: lost, reason: "threshold" }),
    );
    expect((await api.get("/api/me/report?month=2999-01")).status()).toBe(400);
    expect((await api.get("/api/me/report?month=bozuk")).status()).toBe(400);
  } finally {
    await deleteCampaigns(ids);
  }
});
