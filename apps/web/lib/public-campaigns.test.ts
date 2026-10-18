import { createPrismaClient } from "@kartplan/db";
import type { PrismaClient } from "@kartplan/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { campaignPath } from "./campaign-slug";
import { getPublicCampaign, getPublicCampaigns, getSitemapCampaigns } from "./public-campaigns";

// Gerçek veritabanı gerektirir: `docker compose up -d` + `pnpm db:deploy`.
describe.skipIf(!process.env.DATABASE_URL)("herkese açık kampanyalar (veritabanı)", () => {
  let prisma: PrismaClient;
  const run = crypto.randomUUID().slice(0, 8);
  const TODAY = "2026-11-10";
  const ids: Record<string, string> = {};
  const day = (value: string) => new Date(`${value}T00:00:00Z`);

  async function campaign(
    key: string,
    data: {
      programId: string;
      status?: "APPROVED" | "DRAFT" | "REJECTED" | "EXPIRED";
      endsAt?: string;
      joinDeadline?: string;
      categoryIds?: string[];
      merchantIds?: string[];
    },
  ) {
    const created = await prisma.campaign.create({
      data: {
        programId: data.programId,
        title: `Açık ${key} ${run}`,
        sourceUrl: `https://ornek-banka.test/acik/${run}/${key}`,
        rawText: "SENTETİK",
        rawHash: "x",
        summary: [`Özet ${key}`],
        startsAt: day("2026-11-01"),
        endsAt: day(data.endsAt ?? "2026-11-30"),
        joinMethod: "APP",
        ...(data.joinDeadline ? { joinDeadline: day(data.joinDeadline) } : {}),
        status: data.status ?? "APPROVED",
        rules: {
          create: [
            {
              categoryIds: data.categoryIds ?? [],
              merchantIds: data.merchantIds ?? [],
              thresholdType: "CUMULATIVE",
              thresholdKurus: 100_000,
              tierRepeat: false,
              rewardType: "CASHBACK",
              rewardKurus: 5_000,
            },
          ],
        },
      },
    });
    ids[key] = created.id;
  }

  beforeAll(async () => {
    prisma = createPrismaClient();
    const bank = await prisma.bank.create({ data: { name: `Açık Banka ${run}` } });
    const [p1, p2] = await Promise.all(
      ["a", "b"].map((s) =>
        prisma.program.create({
          data: { bankId: bank.id, slug: `acik-${s}-${run}`, name: `Açık ${s}`, pointName: "P" },
        }),
      ),
    );
    const market = await prisma.category.create({
      data: { slug: `acik-m-${run}`, name: `Market ${run}` },
    });
    const online = await prisma.category.create({
      data: { slug: `acik-om-${run}`, name: "Online market", parentId: market.id },
    });
    const fuel = await prisma.category.create({
      data: { slug: `acik-y-${run}`, name: `Yakıt ${run}` },
    });
    const merchant = await prisma.merchant.create({
      data: { name: `Akaryakıt markası ${run}`, categoryId: fuel.id },
    });
    Object.assign(ids, { p1: p1!.id, p2: p2!.id, market: market.id, fuel: fuel.id });

    await campaign("market", { programId: p1!.id, categoryIds: [online.id] });
    await campaign("yakit", {
      programId: p2!.id,
      merchantIds: [merchant.id],
      endsAt: "2026-11-14",
    });
    await campaign("her-sey", { programId: p2!.id });
    await campaign("taslak", { programId: p1!.id, status: "DRAFT" });
    await campaign("red", { programId: p1!.id, status: "REJECTED" });
    await campaign("bitti", { programId: p1!.id, status: "EXPIRED", endsAt: "2026-11-05" });
    await campaign("katilim-gecti", { programId: p1!.id, joinDeadline: "2026-11-09" });
  });

  afterAll(async () => {
    await prisma.campaign.deleteMany({ where: { programId: { in: [ids.p1!, ids.p2!] } } });
    await prisma.merchant.deleteMany({ where: { categoryId: ids.fuel! } });
    await prisma.category.deleteMany({ where: { slug: { contains: run } } });
    await prisma.program.deleteMany({ where: { id: { in: [ids.p1!, ids.p2!] } } });
    await prisma.bank.deleteMany({ where: { name: `Açık Banka ${run}` } });
    await prisma.$disconnect();
  });

  const mine = (list: { title: string }[]) =>
    list.map((c) => c.title.replace(`Açık `, "").replace(` ${run}`, "")).filter(Boolean);

  it("liste: yalnızca onaylı, bitmemiş, katılım süresi geçmemiş; bitişe göre sıralı", async () => {
    const { campaigns, programs } = await getPublicCampaigns({}, TODAY);
    const ours = campaigns.filter((c) => c.title.endsWith(run));
    expect(mine(ours)).toEqual(["yakit", "her-sey", "market"]);
    expect(programs).toEqual(
      expect.arrayContaining([
        { slug: `acik-a-${run}`, name: `Açık Banka ${run} · Açık a` },
        { slug: `acik-b-${run}`, name: `Açık Banka ${run} · Açık b` },
      ]),
    );
    const yakit = ours[0]!;
    expect(yakit).toMatchObject({
      path: campaignPath({ id: ids.yakit!, title: `Açık yakit ${run}` }),
      bankName: `Açık Banka ${run}`,
      categoryNames: [`Yakıt ${run}`], // marka → kategorisi
      endingSoon: true,
      joinRequired: true,
      rewardTypes: ["CASHBACK"],
    });
    expect(ours.find((c) => c.id === ids.market)?.categoryNames).toEqual([`Market ${run}`]);
    expect(ours.find((c) => c.id === ids["her-sey"])?.categoryNames).toEqual([]);
  });

  it("filtre: program ve ana kategori; kategorisiz kampanya her kategoride", async () => {
    const byProgram = await getPublicCampaigns({ program: `acik-b-${run}` }, TODAY);
    expect(mine(byProgram.campaigns)).toEqual(["yakit", "her-sey"]);

    const byCategory = await getPublicCampaigns({ category: `acik-m-${run}` }, TODAY);
    expect(mine(byCategory.campaigns.filter((c) => c.title.endsWith(run)))).toEqual([
      "her-sey",
      "market",
    ]);
    // Alt kategori filtre seçeneği değil; bilinmeyen kategoride yalnızca kategorisizler kalır.
    expect(byCategory.categories.some((c) => c.slug === `acik-om-${run}`)).toBe(false);
    const unknown = await getPublicCampaigns({ category: `yok-${run}` }, TODAY);
    expect(mine(unknown.campaigns.filter((c) => c.title.endsWith(run)))).toEqual(["her-sey"]);
  });

  it("detay: onaylı ve süresi dolmuş açılır, taslak/reddedilen açılmaz", async () => {
    const detail = await getPublicCampaign(ids.market!, TODAY);
    expect(detail).toMatchObject({ expired: false, joinClosed: false, scopeCards: [] });
    expect(detail?.rules[0]?.categoryNames).toEqual(["Online market"]);

    expect(await getPublicCampaign(ids.bitti!, TODAY)).toMatchObject({ expired: true });
    expect(await getPublicCampaign(ids["katilim-gecti"]!, TODAY)).toMatchObject({
      expired: false,
      joinClosed: true,
    });
    expect(await getPublicCampaign(ids.taslak!, TODAY)).toBeNull();
    expect(await getPublicCampaign(ids.red!, TODAY)).toBeNull();
    expect(await getPublicCampaign("yok", TODAY)).toBeNull();
  });

  it("sitemap: listedeki kampanyaların kanonik adresleri", async () => {
    const paths = (await getSitemapCampaigns(TODAY)).map((c) => c.path);
    for (const key of ["market", "yakit", "her-sey"]) {
      expect(paths).toContain(campaignPath({ id: ids[key]!, title: `Açık ${key} ${run}` }));
    }
    for (const key of ["taslak", "red", "bitti", "katilim-gecti"]) {
      expect(paths.some((path) => path.endsWith(ids[key]!))).toBe(false);
    }
  });
});
