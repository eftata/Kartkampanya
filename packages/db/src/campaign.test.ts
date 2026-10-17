import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "./client";
import type { PrismaClient } from "./generated/prisma/client";

// Gerçek veritabanı gerektirir: `docker compose up -d` + `pnpm db:deploy`.
describe.skipIf(!process.env.DATABASE_URL)("Kampanya şeması (veritabanı)", () => {
  let prisma: PrismaClient;
  const run = crypto.randomUUID().slice(0, 8);
  const ids = { bank: "", program: "", cardA: "", cardB: "", source: "", market: "" };

  const campaignData = (suffix: string) => ({
    programId: ids.program,
    sourceId: ids.source,
    title: `Markette 2.500 TL'ye 100 TL ${suffix}`,
    sourceUrl: `https://kampanya.test/${run}/${suffix}`,
    rawText: "Markette toplam 2.500 TL harcamaya 100 TL puan, en fazla 300 TL.",
    rawHash: `hash-${suffix}`,
    summary: ["Markette toplam 2.500 TL harcamaya 100 TL puan", "En fazla 300 TL"],
    startsAt: new Date("2026-11-01T00:00:00Z"),
    endsAt: new Date("2026-11-30T23:59:59Z"),
    joinMethod: "APP" as const,
  });

  beforeAll(async () => {
    prisma = createPrismaClient();
    const bank = await prisma.bank.create({ data: { name: `Kampanya Bankası ${run}` } });
    const program = await prisma.program.create({
      data: { bankId: bank.id, slug: `kmp-${run}`, name: "Kampanyapuan", pointName: "KP" },
    });
    const cardA = await prisma.cardProduct.create({
      data: { programId: program.id, name: "Kart A", type: "CREDIT" },
    });
    const cardB = await prisma.cardProduct.create({
      data: { programId: program.id, name: "Kart B", type: "CREDIT" },
    });
    const source = await prisma.campaignSource.create({
      data: {
        programId: program.id,
        adapter: `test-${run}`,
        listUrl: "https://kampanya.test/liste",
      },
    });
    const market = await prisma.category.create({
      data: { slug: `market-kmp-${run}`, name: "Market" },
    });
    Object.assign(ids, {
      bank: bank.id,
      program: program.id,
      cardA: cardA.id,
      cardB: cardB.id,
      source: source.id,
      market: market.id,
    });
  });

  afterAll(async () => {
    await prisma.campaign.deleteMany({ where: { programId: ids.program } });
    await prisma.pipelineRun.deleteMany({ where: { sourceId: ids.source } });
    await prisma.campaignSource.deleteMany({ where: { programId: ids.program } });
    await prisma.cardProduct.deleteMany({ where: { programId: ids.program } });
    await prisma.program.deleteMany({ where: { id: ids.program } });
    await prisma.bank.deleteMany({ where: { id: ids.bank } });
    await prisma.category.deleteMany({ where: { id: ids.market } });
    await prisma.$disconnect();
  });

  it("kuralları ve kart kapsamıyla DRAFT kampanya oluşturur", async () => {
    const campaign = await prisma.campaign.create({
      data: {
        ...campaignData("a"),
        confidence: 0.86,
        uncertainFields: ["joinDeadline"],
        cardScope: { create: [{ cardProductId: ids.cardA }] },
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
              exclusions: ["taksitli"],
            },
          ],
        },
      },
      include: { rules: true, cardScope: true },
    });
    expect(campaign.status).toBe("DRAFT");
    expect(campaign.cardScope.map((c) => c.cardProductId)).toEqual([ids.cardA]);
    expect(campaign.rules[0]).toMatchObject({
      thresholdKurus: 250_000,
      tierRepeat: true,
      capKurus: 30_000,
    });
  });

  it("aynı kaynak adresi ikinci kez eklenemez; adaptör adı tekildir", async () => {
    await expect(prisma.campaign.create({ data: campaignData("a") })).rejects.toThrow();
    await expect(
      prisma.campaignSource.create({
        data: { programId: ids.program, adapter: `test-${run}`, listUrl: "https://x.test" },
      }),
    ).rejects.toThrow();
  });

  it("yayındaki kampanyalar durum ve bitiş tarihine göre sorgulanır", async () => {
    await prisma.campaign.create({ data: { ...campaignData("b"), status: "APPROVED" } });
    await prisma.campaign.create({
      data: { ...campaignData("c"), status: "APPROVED", endsAt: new Date("2026-10-01T00:00:00Z") },
    });
    const active = await prisma.campaign.findMany({
      where: {
        programId: ids.program,
        status: "APPROVED",
        endsAt: { gte: new Date("2026-11-15T00:00:00Z") },
      },
    });
    expect(active.map((c) => c.sourceUrl)).toEqual([`https://kampanya.test/${run}/b`]);
  });

  it("kampanya kapsamındaki kart ürünü silinemez", async () => {
    await expect(prisma.cardProduct.delete({ where: { id: ids.cardA } })).rejects.toThrow();
  });

  it("kampanya silinince kuralları ve kapsamı da silinir", async () => {
    const campaign = await prisma.campaign.findUniqueOrThrow({
      where: { sourceUrl: `https://kampanya.test/${run}/a` },
    });
    await prisma.campaign.delete({ where: { id: campaign.id } });
    expect(await prisma.campaignRule.count({ where: { campaignId: campaign.id } })).toBe(0);
    expect(await prisma.campaignCard.count({ where: { campaignId: campaign.id } })).toBe(0);
  });

  it("çalıştırma kaydı RUNNING başlar, sonuçla kapanır; çalıştırması olan kaynak silinemez", async () => {
    const pipelineRun = await prisma.pipelineRun.create({ data: { sourceId: ids.source } });
    expect(pipelineRun.status).toBe("RUNNING");
    const finished = await prisma.pipelineRun.update({
      where: { id: pipelineRun.id },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        found: 12,
        changed: 3,
        errors: [{ url: "https://kampanya.test/x", message: "zaman aşımı" }],
      },
    });
    expect(finished).toMatchObject({ status: "SUCCEEDED", found: 12, changed: 3 });
    await expect(prisma.campaignSource.delete({ where: { id: ids.source } })).rejects.toThrow();
  });
});
