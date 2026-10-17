import { createPrismaClient } from "@kartplan/db";
import type { PrismaClient } from "@kartplan/db";
import type { AdminCampaignInput } from "@kartplan/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getAuditLog } from "./admin-audit";
import { getAdminCampaign, getReviewQueue, reviewCampaign } from "./admin-campaigns";
import type { Actor } from "./admin-audit";

// Gerçek veritabanı gerektirir: `docker compose up -d` + `pnpm db:deploy`.
describe.skipIf(!process.env.DATABASE_URL)("admin onay kuyruğu (veritabanı)", () => {
  let prisma: PrismaClient;
  let actor: Actor;
  const run = crypto.randomUUID().slice(0, 8);
  const ids = { bank: "", program: "", other: "", card: "", otherCard: "", category: "" };
  const ids2 = { merchant: "", campaign: "", expired: "" };
  const NOW = new Date("2026-10-17T12:00:00Z");

  const input = (overrides: Partial<AdminCampaignInput> = {}): AdminCampaignInput => ({
    title: "Markette 2.500 TL'ye 150 TL puan",
    summary: ["Markette toplam 2.500 TL harcamaya 150 TL puan", "En fazla 300 TL"],
    startsAt: "2026-11-01",
    endsAt: "2026-11-30",
    joinMethod: "SMS",
    joinDeadline: "2026-11-15",
    cardIds: [ids.card],
    rules: [
      {
        categoryIds: [ids.category],
        merchantIds: [ids2.merchant],
        thresholdType: "CUMULATIVE",
        thresholdKurus: 250_000,
        txnCount: null,
        tierRepeat: true,
        rewardType: "POINTS",
        rewardKurus: 15_000,
        rewardBps: null,
        capKurus: 30_000,
        exclusions: ["taksitli"],
      },
    ],
    ...overrides,
  });

  async function draftCampaign(slug: string, endsAt: Date) {
    const campaign = await prisma.campaign.create({
      data: {
        programId: ids.program,
        title: `Kampanya ${slug}`,
        sourceUrl: `https://ornek-banka.test/${run}/${slug}`,
        rawText: "SENTETİK metin",
        rawHash: "x",
        summary: ["LLM özeti"],
        startsAt: new Date("2026-11-01T00:00:00Z"),
        endsAt,
        joinMethod: "APP",
        confidence: 0.6,
        uncertainFields: ["rules[0].cap_kurus"],
        rules: {
          create: [
            {
              categoryIds: [],
              merchantIds: [],
              thresholdType: "CUMULATIVE",
              thresholdKurus: 250_000,
              rewardType: "POINTS",
              rewardKurus: 10_000,
              capKurus: 30_000,
            },
          ],
        },
      },
    });
    return campaign.id;
  }

  beforeAll(async () => {
    prisma = createPrismaClient();
    const admin = await prisma.user.create({
      data: { email: `onay-${run}@kartplan.test`, role: "ADMIN" },
    });
    actor = { id: admin.id, email: admin.email };
    const bank = await prisma.bank.create({ data: { name: `Onay Bankası ${run}` } });
    const [program, other] = await Promise.all(
      ["a", "b"].map((suffix) =>
        prisma.program.create({
          data: { bankId: bank.id, slug: `onay-${suffix}-${run}`, name: suffix, pointName: "P" },
        }),
      ),
    );
    const [card, otherCard] = await Promise.all(
      [program!, other!].map((p) =>
        prisma.cardProduct.create({
          data: { programId: p.id, name: `Kart ${p.slug}`, type: "CREDIT" },
        }),
      ),
    );
    const category = await prisma.category.create({
      data: { slug: `onay-${run}`, name: `Onay ${run}` },
    });
    const merchant = await prisma.merchant.create({
      data: { name: `Onay Market ${run}`, categoryId: category.id },
    });
    Object.assign(ids, {
      bank: bank.id,
      program: program!.id,
      other: other!.id,
      card: card!.id,
      otherCard: otherCard!.id,
      category: category.id,
    });
    ids2.merchant = merchant.id;
    ids2.campaign = await draftCampaign("market", new Date("2026-11-30T00:00:00Z"));
    ids2.expired = await draftCampaign("eski", new Date("2026-10-01T00:00:00Z"));
  });

  afterAll(async () => {
    await prisma.campaign.deleteMany({ where: { programId: ids.program } });
    await prisma.cardProduct.deleteMany({ where: { program: { bankId: ids.bank } } });
    await prisma.program.deleteMany({ where: { bankId: ids.bank } });
    await prisma.bank.deleteMany({ where: { id: ids.bank } });
    await prisma.merchant.deleteMany({ where: { id: ids2.merchant } });
    await prisma.category.deleteMany({ where: { id: ids.category } });
    await prisma.adminAuditLog.deleteMany({ where: { actorId: actor.id } });
    await prisma.user.deleteMany({ where: { id: actor.id } });
    await prisma.$disconnect();
  });

  it("kuyruk taslakları en yakın bitenden listeler", async () => {
    const { campaigns, counts } = await getReviewQueue("DRAFT");
    const mine = campaigns.filter((c) => [ids2.campaign, ids2.expired].includes(c.id));
    expect(mine.map((c) => c.id)).toEqual([ids2.expired, ids2.campaign]);
    expect(mine[0]?._count.rules).toBe(1);
    expect(counts.DRAFT).toBeGreaterThanOrEqual(2);
  });

  it("kaydet: durum değişmez, kurallar ve kart kapsamı değişir, kayıt yazılır", async () => {
    const result = await reviewCampaign(
      actor,
      ids2.campaign,
      { action: "save", campaign: input() },
      NOW,
    );
    expect(result).toEqual({ ok: true, data: { status: "DRAFT" } });
    const campaign = await getAdminCampaign(ids2.campaign);
    expect(campaign?.status).toBe("DRAFT");
    expect(campaign?.joinMethod).toBe("SMS");
    expect(campaign?.joinDeadline).toEqual(new Date("2026-11-15T00:00:00Z"));
    expect(campaign?.summary).toEqual(input().summary);
    expect(campaign?.cardScope).toEqual([{ cardProductId: ids.card }]);
    expect(campaign?.rules).toHaveLength(1);
    expect(campaign?.rules[0]).toMatchObject({
      categoryIds: [ids.category],
      merchantIds: [ids2.merchant],
      rewardKurus: 15_000,
      tierRepeat: true,
      exclusions: ["taksitli"],
    });

    const [entry] = await getAuditLog({ entityType: "Campaign", entityId: ids2.campaign }, 1);
    expect(entry?.action).toBe("campaign.update");
    expect(entry?.actorEmail).toBe(actor.email);
    const data = entry?.data as Record<string, { from: unknown; to: unknown }>;
    expect(data.joinMethod).toEqual({ from: "APP", to: "SMS" });
    expect(data.rules?.to).toEqual(input().rules);
    expect(data.cardIds).toEqual({ from: [], to: [ids.card] });
    expect(data.status).toBeUndefined();
  });

  it("başka programın kartı, geçmiş bitiş ve olmayan kampanya reddedilir", async () => {
    expect(
      await reviewCampaign(
        actor,
        ids2.campaign,
        { action: "save", campaign: input({ cardIds: [ids.otherCard] }) },
        NOW,
      ),
    ).toMatchObject({ ok: false, code: "conflict", error: expect.stringContaining("programa") });
    expect(
      await reviewCampaign(
        actor,
        ids2.expired,
        { action: "approve", campaign: input({ startsAt: "2026-09-01", endsAt: "2026-10-01" }) },
        NOW,
      ),
    ).toMatchObject({ ok: false, code: "conflict", error: expect.stringContaining("geçmiş") });
    expect(await reviewCampaign(actor, "yok", { action: "reject" }, NOW)).toMatchObject({
      ok: false,
      code: "not_found",
    });
  });

  it("onayla yayına alır, reddet gerekçesiyle kaydeder", async () => {
    expect(
      await reviewCampaign(actor, ids2.campaign, { action: "approve", campaign: input() }, NOW),
    ).toEqual({ ok: true, data: { status: "APPROVED" } });
    let [entry] = await getAuditLog({ entityType: "Campaign", entityId: ids2.campaign }, 1);
    expect(entry?.action).toBe("campaign.approve");
    expect(entry?.data).toEqual({ status: { from: "DRAFT", to: "APPROVED" } });

    expect(
      await reviewCampaign(actor, ids2.expired, { action: "reject", reason: "Süresi geçmiş" }, NOW),
    ).toEqual({ ok: true, data: { status: "REJECTED" } });
    [entry] = await getAuditLog({ entityType: "Campaign", entityId: ids2.expired }, 1);
    expect(entry?.action).toBe("campaign.reject");
    expect(entry?.data).toEqual({
      status: { from: "DRAFT", to: "REJECTED" },
      reason: "Süresi geçmiş",
    });

    const approved = await getReviewQueue("APPROVED");
    expect(approved.campaigns.map((c) => c.id)).toContain(ids2.campaign);
  });
});
