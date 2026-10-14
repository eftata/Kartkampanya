import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "./client";
import type { PrismaClient } from "./generated/prisma/client";

// Gerçek veritabanı gerektirir: `docker compose up -d` + `pnpm db:deploy`.
describe.skipIf(!process.env.DATABASE_URL)("Katalog şeması (veritabanı)", () => {
  let prisma: PrismaClient;
  const run = crypto.randomUUID().slice(0, 8);
  const ids = { bank: "", program: "", card: "", market: "", fuel: "", user: "" };

  beforeAll(async () => {
    prisma = createPrismaClient();
    const bank = await prisma.bank.create({ data: { name: `Test Bankası ${run}` } });
    const program = await prisma.program.create({
      data: {
        bankId: bank.id,
        slug: `test-${run}`,
        name: "Testpuan",
        pointName: "TestPuan",
        pointValueTL: "0.5",
      },
    });
    const card = await prisma.cardProduct.create({
      data: { programId: program.id, name: "Test Platinum", type: "CREDIT", baseRateBps: 50 },
    });
    const market = await prisma.category.create({
      data: { slug: `market-${run}`, name: "Market" },
    });
    const fuel = await prisma.category.create({
      data: { slug: `akaryakit-${run}`, name: "Akaryakıt" },
    });
    const user = await prisma.user.create({ data: { email: `katalog-${run}@kartplan.test` } });
    Object.assign(ids, {
      bank: bank.id,
      program: program.id,
      card: card.id,
      market: market.id,
      fuel: fuel.id,
      user: user.id,
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: ids.user } });
    await prisma.merchant.deleteMany({ where: { categoryId: { in: [ids.market, ids.fuel] } } });
    await prisma.cardProduct.deleteMany({ where: { programId: ids.program } });
    await prisma.category.deleteMany({ where: { id: { in: [ids.market, ids.fuel] } } });
    await prisma.program.deleteMany({ where: { id: ids.program } });
    await prisma.bank.deleteMany({ where: { id: ids.bank } });
    await prisma.$disconnect();
  });

  it("banka → program → kart ağacını ve oranları okur", async () => {
    await prisma.earnRate.create({
      data: { cardProductId: ids.card, categoryId: ids.fuel, rateBps: 100 },
    });
    const bank = await prisma.bank.findUniqueOrThrow({
      where: { id: ids.bank },
      include: { programs: { include: { cards: { include: { earnRates: true } } } } },
    });
    const card = bank.programs[0]?.cards[0];
    expect(bank.programs[0]?.pointValueTL.toString()).toBe("0.5");
    expect(card?.baseRateBps).toBe(50);
    expect(card?.earnRates.map((r) => [r.categoryId, r.rateBps])).toEqual([[ids.fuel, 100]]);
  });

  it("bir kart için aynı kategoriye ikinci oran girilemez", async () => {
    await expect(
      prisma.earnRate.create({
        data: { cardProductId: ids.card, categoryId: ids.fuel, rateBps: 200 },
      }),
    ).rejects.toThrow();
  });

  it("program slug'ı ve bankadaki program adı tekildir", async () => {
    await expect(
      prisma.program.create({
        data: { bankId: ids.bank, slug: `test-${run}`, name: "Başka", pointName: "X" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.program.create({
        data: { bankId: ids.bank, slug: `diger-${run}`, name: "Testpuan", pointName: "X" },
      }),
    ).rejects.toThrow();
  });

  it("kategoriler ağaç kurar ve markalar kategoriye bağlıdır", async () => {
    const child = await prisma.category.create({
      data: { slug: `online-market-${run}`, name: "Online market", parentId: ids.market },
    });
    await prisma.merchant.create({ data: { name: `Test Market ${run}`, categoryId: ids.market } });
    const market = await prisma.category.findUniqueOrThrow({
      where: { id: ids.market },
      include: { children: true, merchants: true },
    });
    expect(market.children.map((c) => c.id)).toEqual([child.id]);
    expect(market.merchants).toHaveLength(1);
    await prisma.category.delete({ where: { id: child.id } });
  });

  it("harcama profili kullanıcı başına kategori tekildir", async () => {
    await prisma.spendProfile.create({
      data: { userId: ids.user, categoryId: ids.market, monthlyKurus: 600_000, merchantIds: [] },
    });
    await expect(
      prisma.spendProfile.create({
        data: { userId: ids.user, categoryId: ids.market, monthlyKurus: 1, merchantIds: [] },
      }),
    ).rejects.toThrow();
    // upsert, profil ekranının kaydetme yolu
    const updated = await prisma.spendProfile.upsert({
      where: { userId_categoryId: { userId: ids.user, categoryId: ids.market } },
      update: { monthlyKurus: 450_000 },
      create: { userId: ids.user, categoryId: ids.market, monthlyKurus: 450_000 },
    });
    expect(updated.monthlyKurus).toBe(450_000);
  });

  it("kullanıcının seçtiği kart ürünü silinemez", async () => {
    await prisma.userCard.create({
      data: { userId: ids.user, cardProductId: ids.card, limitKurus: 1_000_000, statementDay: 15 },
    });
    await expect(prisma.cardProduct.delete({ where: { id: ids.card } })).rejects.toThrow();
  });

  it("kullanıcı silinince kartları ve harcama profili de silinir (KVKK)", async () => {
    const user = await prisma.user.create({ data: { email: `silinecek-${run}@kartplan.test` } });
    await prisma.userCard.create({ data: { userId: user.id, cardProductId: ids.card } });
    await prisma.spendProfile.create({
      data: { userId: user.id, categoryId: ids.fuel, monthlyKurus: 300_000 },
    });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.userCard.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.spendProfile.count({ where: { userId: user.id } })).toBe(0);
  });
});
