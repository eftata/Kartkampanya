import { expect, test } from "@playwright/test";

import { createDraftCampaign, deleteCampaigns, signUp } from "./helpers";

type Banks = { banks: { programs: { slug: string; cards: { id: string }[] }[] }[] };
type Categories = { categories: { id: string; slug: string }[] };
type Advice = {
  cards: {
    name: string;
    totalKurus: number;
    campaigns: { id: string; gainKurus: number }[];
    ifJoined: { id: string; gainKurus: number }[];
  }[];
};

/** Bugünden `days` gün sonrası (Türkiye takvimi, UTC+3). */
function daysFromNow(days: number): string {
  return new Date(Date.now() + 3 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);
}

test("tek alışveriş: hangi kartla ne kazanılır; katılım gereken kampanya ayrı gösterilir", async ({
  page,
}) => {
  const run = Date.now().toString(36);
  const title = `E2E e-ticaret ${run}`;
  // Paraf + e-ticaret ve gelecek ay(lar): bu ayın planlarına ve diğer testlere girmez.
  // Her 3.000 TL'ye 100 TL, en fazla 300 TL; uygulamadan katılım gerekir.
  const date = daysFromNow(46);
  const ids = [
    await createDraftCampaign(title, {
      status: "APPROVED",
      categorySlug: "e-ticaret",
      programSlug: "paraf",
      thresholdKurus: 300_000,
      rewardKurus: 10_000,
      startsAt: daysFromNow(40),
      endsAt: daysFromNow(60),
    }),
  ];
  try {
    await signUp(page);
    const api = page.request;

    // Kart yokken hesaplayıcı onboarding'e yönlendirir.
    await page.goto("/hesapla");
    await expect(page).toHaveURL(/\/baslangic/);

    const { banks } = (await (await api.get("/api/catalog/banks")).json()) as Banks;
    const programs = banks.flatMap((b) => b.programs);
    for (const slug of ["paraf", "axess"]) {
      const cardProductId = programs.find((p) => p.slug === slug)!.cards[0]!.id;
      expect((await api.post("/api/me/cards", { data: { cardProductId } })).status()).toBe(201);
    }
    const { categories } = (await (await api.get("/api/catalog/categories")).json()) as Categories;
    const eticaret = categories.find((c) => c.slug === "e-ticaret")!.id;

    // API: katılmadan kazanç "katılırsan" listesinde; toplam yalnızca kart puanı.
    const ask = () =>
      api.post("/api/me/purchase-advice", {
        data: { amountKurus: 400_000, categoryId: eticaret, date },
      });
    let advice = (await (await ask()).json()) as Advice;
    expect(advice.cards).toHaveLength(2);
    const paraf = advice.cards.find((c) => c.ifJoined.length > 0)!;
    expect(paraf.ifJoined).toEqual([{ id: ids[0], title, gainKurus: 10_000, joinDeadline: null }]);
    expect(paraf.campaigns).toEqual([]);

    // Hatalı girdiler.
    const past = await api.post("/api/me/purchase-advice", {
      data: { amountKurus: 400_000, categoryId: eticaret, date: "2020-01-01" },
    });
    expect(past.status()).toBe(409);
    const unknown = await api.post("/api/me/purchase-advice", {
      data: { amountKurus: 400_000, categoryId: "yok" },
    });
    expect(unknown.status()).toBe(404);
    const bad = await api.post("/api/me/purchase-advice", {
      data: { amountKurus: 0, categoryId: eticaret },
    });
    expect(bad.status()).toBe(400);

    // Katılınca kazanç kampanyaya geçer ve kart başa gelir.
    expect(
      (await api.patch(`/api/me/campaigns/${ids[0]}`, { data: { joined: true } })).status(),
    ).toBe(200);
    advice = (await (await ask()).json()) as Advice;
    const best = advice.cards[0]!;
    expect(best.name).toBe(paraf.name);
    expect(best.campaigns).toEqual([{ id: ids[0], title, gainKurus: 10_000 }]);
    expect(best.totalKurus).toBe(paraf.totalKurus + 10_000);

    // Arayüz: form adres çubuğuna yazar, sonuç kartları sıralı.
    await page.goto("/hesapla");
    const form = page.getByRole("form", { name: "Alışveriş" });
    await form.getByLabel("Tutar (TL)").fill("4.000");
    await form.getByLabel("Kategori").selectOption({ label: "E-ticaret" });
    await form.getByLabel("Ne zaman?").fill(date);
    await form.getByRole("button", { name: "Hesapla" }).click();
    await expect(page).toHaveURL(/tutar=4\.000/);
    const result = page.getByRole("region", { name: "Sonuç" });
    await expect(result.getByRole("status")).toContainText(`${paraf.name} ile öde`);
    const parafItem = result.getByRole("listitem", { name: paraf.name, exact: true });
    await expect(parafItem).toContainText(`${title}: +₺100`);
    await expect(result.getByRole("listitem", { name: /./ }).first()).toHaveAccessibleName(
      paraf.name,
    );

    // Geçersiz tutar formda Türkçe hata verir.
    await page.goto(`/hesapla?tutar=dort+bin&kategori=${eticaret}`);
    await expect(page.getByText("Tutarı TL olarak yaz")).toBeVisible();
  } finally {
    await deleteCampaigns(ids);
  }
});
