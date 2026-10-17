import { expect, test } from "@playwright/test";

import { createDraftCampaign, deleteCampaigns, signUp } from "./helpers";

type Banks = { banks: { programs: { slug: string; cards: { id: string }[] }[] }[] };
type Categories = { categories: { id: string; slug: string }[] };
type Campaigns = { campaigns: { id: string; upcoming: boolean; cards: { id: string }[] }[] };

test("kişisel kampanya API'si yalnızca kullanıcının kartına ve alanına uyanları döner", async ({
  page,
  request,
}) => {
  expect((await request.get("/api/me/campaigns")).status()).toBe(401);

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

    expect((await api.get("/api/me/campaigns?sort=en-iyi")).status()).toBe(400);
    expect((await api.get("/api/me/campaigns?type=HEDIYE")).status()).toBe(400);
  } finally {
    await deleteCampaigns(ids);
  }
});
