import { createPrismaClient } from "@kartplan/db";
import type { PrismaClient } from "@kartplan/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getMyCampaignDetail, getMyCampaigns } from "./campaigns";

// Gerçek veritabanı gerektirir: `docker compose up -d` + `pnpm db:deploy`.
describe.skipIf(!process.env.DATABASE_URL)("kişisel kampanya eşleştirme (veritabanı)", () => {
  let prisma: PrismaClient;
  const run = crypto.randomUUID().slice(0, 8);
  const TODAY = "2026-11-01";
  const ids = {
    bank: "",
    p1: "",
    p2: "",
    c1: "",
    c2: "",
    c3: "",
    market: "",
    online: "",
    clothes: "",
    user: "",
    userCard: "",
  };
  const campaigns: Record<string, string> = {};

  const day = (value: string) => new Date(`${value}T00:00:00Z`);
  async function campaign(
    key: string,
    data: {
      programId: string;
      status?: "APPROVED" | "DRAFT";
      endsAt?: string;
      joinMethod?: "AUTO" | "APP";
      cardIds?: string[];
      rule?: Record<string, unknown>;
    },
  ) {
    const created = await prisma.campaign.create({
      data: {
        programId: data.programId,
        title: `Eşleşme ${key} ${run}`,
        sourceUrl: `https://ornek-banka.test/${run}/${key}`,
        rawText: "SENTETİK",
        rawHash: "x",
        summary: [`Özet ${key}`],
        startsAt: day("2026-11-01"),
        endsAt: day(data.endsAt ?? "2026-11-30"),
        joinMethod: data.joinMethod ?? "APP",
        status: data.status ?? "APPROVED",
        cardScope: { create: (data.cardIds ?? []).map((cardProductId) => ({ cardProductId })) },
        rules: {
          create: [
            {
              categoryIds: [ids.market],
              thresholdType: "CUMULATIVE",
              thresholdKurus: 250_000,
              tierRepeat: true,
              rewardType: "POINTS",
              rewardKurus: 10_000,
              capKurus: 30_000,
              ...data.rule,
            },
          ],
        },
      },
    });
    campaigns[key] = created.id;
  }

  beforeAll(async () => {
    prisma = createPrismaClient();
    const bank = await prisma.bank.create({ data: { name: `Eşleşme Bankası ${run}` } });
    const [p1, p2] = await Promise.all(
      ["a", "b"].map((s) =>
        prisma.program.create({
          data: { bankId: bank.id, slug: `es-${s}-${run}`, name: `Program ${s}`, pointName: "P" },
        }),
      ),
    );
    const [c1, c2, c3] = await Promise.all(
      [p1!, p1!, p2!].map((p, i) =>
        prisma.cardProduct.create({ data: { programId: p.id, name: `Kart ${i}`, type: "CREDIT" } }),
      ),
    );
    const market = await prisma.category.create({ data: { slug: `es-m-${run}`, name: "Market" } });
    const online = await prisma.category.create({
      data: { slug: `es-mo-${run}`, name: "Online market", parentId: market.id },
    });
    const clothes = await prisma.category.create({ data: { slug: `es-g-${run}`, name: "Giyim" } });
    const user = await prisma.user.create({ data: { email: `eslesme-${run}@kartplan.test` } });
    const userCard = await prisma.userCard.create({
      data: { userId: user.id, cardProductId: c1!.id, nickname: "Ana kartım" },
    });
    await prisma.spendProfile.create({
      data: { userId: user.id, categoryId: market.id, monthlyKurus: 400_000 },
    });
    Object.assign(ids, {
      bank: bank.id,
      p1: p1!.id,
      p2: p2!.id,
      c1: c1!.id,
      c2: c2!.id,
      c3: c3!.id,
      market: market.id,
      online: online.id,
      clothes: clothes.id,
      user: user.id,
      userCard: userCard.id,
    });

    await campaign("uyan", { programId: ids.p1 });
    await campaign("alt-kategori", {
      programId: ids.p1,
      endsAt: "2026-11-05",
      joinMethod: "AUTO",
      rule: {
        categoryIds: [ids.online],
        thresholdKurus: 0,
        tierRepeat: false,
        rewardType: "CASHBACK",
        rewardKurus: null,
        rewardBps: 1_000,
        capKurus: 5_000,
      },
    });
    await campaign("kapsamli", { programId: ids.p1, cardIds: [ids.c1] });
    await campaign("taslak", { programId: ids.p1, status: "DRAFT" });
    await campaign("baska-program", { programId: ids.p2 });
    await campaign("baska-kart", { programId: ids.p1, cardIds: [ids.c2] });
    await campaign("baska-alan", { programId: ids.p1, rule: { categoryIds: [ids.clothes] } });
    await campaign("bitmis", { programId: ids.p1, endsAt: "2026-10-31" });
  });

  afterAll(async () => {
    await prisma.campaign.deleteMany({ where: { program: { bankId: ids.bank } } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
    await prisma.cardProduct.deleteMany({ where: { program: { bankId: ids.bank } } });
    await prisma.program.deleteMany({ where: { bankId: ids.bank } });
    await prisma.bank.deleteMany({ where: { id: ids.bank } });
    await prisma.category.deleteMany({ where: { id: { in: [ids.online] } } });
    await prisma.category.deleteMany({ where: { id: { in: [ids.market, ids.clothes] } } });
    await prisma.$disconnect();
  });

  const titles = (list: { title: string }[]) => list.map((c) => c.title.split(" ")[1]);

  it("yalnızca onaylı, süresi geçmemiş, kartına ve alanına uyan kampanyalar döner", async () => {
    const list = await getMyCampaigns(ids.user, { sort: "ends" }, TODAY);
    expect(titles(list)).toEqual(["alt-kategori", "kapsamli", "uyan"]);
    const [soon] = list;
    expect(soon).toMatchObject({
      bankName: `Eşleşme Bankası ${run}`,
      programName: "Program a",
      startsAt: "2026-11-01",
      endsAt: "2026-11-05",
      joinMethod: "AUTO",
      joinRequired: false,
      endingSoon: true,
      upcoming: false,
      cards: [{ id: ids.userCard, name: "Ana kartım" }],
      categories: [{ id: ids.market, name: "Market" }],
      rewardTypes: ["CASHBACK"],
      // 5 gün: 4.000 TL × 5/30 = 666,66 TL × %10 = 66,66 TL → tavan 50 TL
      estimateKurus: 5_000,
    });
    expect(list[2]).toMatchObject({ joinRequired: true, endingSoon: false, estimateKurus: 10_000 });
  });

  it("filtreler ve kazanca göre sıralama", async () => {
    const byGain = await getMyCampaigns(ids.user, { sort: "gain" }, TODAY);
    expect(titles(byGain)).toEqual(["kapsamli", "uyan", "alt-kategori"]);
    expect(
      titles(await getMyCampaigns(ids.user, { sort: "ends", type: "CASHBACK" }, TODAY)),
    ).toEqual(["alt-kategori"]);
    expect(await getMyCampaigns(ids.user, { sort: "ends", category: ids.clothes }, TODAY)).toEqual(
      [],
    );
    expect(await getMyCampaigns(ids.user, { sort: "ends", card: "baska" }, TODAY)).toEqual([]);
    expect(
      await getMyCampaigns(ids.user, { sort: "ends", card: ids.userCard }, TODAY),
    ).toHaveLength(3);
  });

  it("kartı ya da harcama profili olmayan kullanıcıya kampanya dönmez", async () => {
    const other = await prisma.user.create({ data: { email: `bos-${run}@kartplan.test` } });
    try {
      expect(await getMyCampaigns(other.id, { sort: "ends" }, TODAY)).toEqual([]);
    } finally {
      await prisma.user.delete({ where: { id: other.id } });
    }
  });

  it("detay: uyan, uymayan, süresi geçmiş ve taslak kampanya", async () => {
    const match = await getMyCampaignDetail(ids.user, campaigns["kapsamli"]!, TODAY);
    expect(match).toMatchObject({ matches: true, expired: false, scopeCards: ["Kart 0"] });
    expect(match?.campaign.cards).toEqual([{ id: ids.userCard, name: "Ana kartım" }]);
    expect(match?.rules[0]).toMatchObject({ categoryNames: ["Market"], merchantNames: [] });

    const other = await getMyCampaignDetail(ids.user, campaigns["baska-alan"]!, TODAY);
    expect(other).toMatchObject({ matches: false, expired: false, scopeCards: [] });
    expect(other?.campaign).toMatchObject({ cards: [], estimateKurus: 0, rewardTypes: ["POINTS"] });
    expect(other?.rules[0]?.categoryNames).toEqual(["Giyim"]);

    expect(await getMyCampaignDetail(ids.user, campaigns["bitmis"]!, TODAY)).toMatchObject({
      matches: false,
      expired: true,
    });
    expect(await getMyCampaignDetail(ids.user, campaigns["taslak"]!, TODAY)).toBeNull();
    expect(await getMyCampaignDetail(ids.user, "yok", TODAY)).toBeNull();
  });
});
