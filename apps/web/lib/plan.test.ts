import { createPrismaClient } from "@kartplan/db";
import type { PrismaClient } from "@kartplan/db";
import type { PlanRequestInput } from "@kartplan/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getMonthlyPlan } from "./plan";

const engine = vi.hoisted(() => ({ calls: [] as PlanRequestInput[] }));
vi.mock("@/lib/engine", () => ({
  optimizePlan: (request: PlanRequestInput) => {
    engine.calls.push(request);
    return Promise.resolve({
      ok: true,
      plan: {
        status: "OPTIMAL",
        allocations: [],
        campaignsHit: request.campaigns.map((c) => ({ id: c.id, tiers: 1, reward: 1 })),
        nearMisses: [],
        unallocated: [],
        totalExpected: 0,
        baseline: { strategy: "single_best_card", card: null, total: 0 },
        solver: { engine: "cp-sat", ms: 1 },
      },
    });
  },
}));

// Gerçek veritabanı gerektirir: `docker compose up -d` + `pnpm db:deploy`.
describe.skipIf(!process.env.DATABASE_URL)("aylık plan girdisi (veritabanı)", () => {
  let prisma: PrismaClient;
  const run = crypto.randomUUID().slice(0, 8);
  const TODAY = "2026-11-10";
  const ids = { bank: "", user: "", market: "", userCard: "", tiered: "", draft: "", later: "" };

  beforeAll(async () => {
    prisma = createPrismaClient();
    const bank = await prisma.bank.create({ data: { name: `Plan Bankası ${run}` } });
    const program = await prisma.program.create({
      data: { bankId: bank.id, slug: `plan-${run}`, name: "Planpuan", pointName: "P" },
    });
    const market = await prisma.category.create({
      data: { slug: `plan-m-${run}`, name: "Plan market" },
    });
    const product = await prisma.cardProduct.create({
      data: {
        programId: program.id,
        name: "Plan Kart",
        type: "CREDIT",
        baseRateBps: 50,
        earnRates: { create: [{ categoryId: market.id, rateBps: 100 }] },
      },
    });
    const user = await prisma.user.create({ data: { email: `plan-${run}@kartplan.test` } });
    const userCard = await prisma.userCard.create({
      data: { userId: user.id, cardProductId: product.id, limitKurus: 2_000_000 },
    });
    await prisma.spendProfile.create({
      data: { userId: user.id, categoryId: market.id, monthlyKurus: 500_000 },
    });
    const campaign = (title: string, extra: Record<string, unknown>, rules: number[]) =>
      prisma.campaign.create({
        data: {
          programId: program.id,
          title,
          sourceUrl: `https://ornek-banka.test/${run}/${title}`,
          rawText: "SENTETİK",
          rawHash: "x",
          startsAt: new Date("2026-11-01T00:00:00Z"),
          endsAt: new Date("2026-11-30T00:00:00Z"),
          joinMethod: "APP",
          status: "APPROVED",
          ...extra,
          rules: {
            create: rules.map((threshold, i) => ({
              categoryIds: [market.id],
              thresholdType: "CUMULATIVE" as const,
              thresholdKurus: threshold,
              rewardType: "POINTS" as const,
              rewardKurus: 5_000 * (i + 1),
            })),
          },
        },
      });
    const [tiered, draft, later] = await Promise.all([
      campaign("kademeli", {}, [100_000, 300_000]),
      campaign("taslak", { status: "DRAFT" }, [100_000]),
      campaign(
        "aralik",
        {
          startsAt: new Date("2026-12-01T00:00:00Z"),
          endsAt: new Date("2026-12-31T00:00:00Z"),
        },
        [100_000],
      ),
    ]);
    Object.assign(ids, {
      bank: bank.id,
      user: user.id,
      market: market.id,
      userCard: userCard.id,
      tiered: tiered.id,
      draft: draft.id,
      later: later.id,
    });
  });

  afterAll(async () => {
    await prisma.campaign.deleteMany({ where: { program: { bankId: ids.bank } } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
    await prisma.cardProduct.deleteMany({ where: { program: { bankId: ids.bank } } });
    await prisma.program.deleteMany({ where: { bankId: ids.bank } });
    await prisma.bank.deleteMany({ where: { id: ids.bank } });
    await prisma.category.deleteMany({ where: { id: ids.market } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    engine.calls.length = 0;
  });

  it("kullanıcının kartı, profili ve bu ayki onaylı kampanyalarıyla motoru çağırır", async () => {
    const result = await getMonthlyPlan(ids.user, TODAY);
    expect(result.status).toBe("ok");
    const [request] = engine.calls;
    expect(request?.month).toBe("2026-11");
    expect(request?.budget).toEqual([{ category: ids.market, amount: 500_000 }]);
    expect(request?.cards).toEqual([
      { id: ids.userCard, limit: 2_000_000, baseRateBps: { "*": 50, [ids.market]: 100 } },
    ]);
    // Yalnızca kademeli kampanya: taslak ve gelecek aydaki girmez; iki kural aynı grupta.
    expect(request?.campaigns.map((c) => [c.threshold, c.reward, c.group])).toEqual([
      [100_000, 5_000, ids.tiered],
      [300_000, 10_000, ids.tiered],
    ]);
    if (result.status !== "ok") return;
    const ruleIds = request!.campaigns.map((c) => c.id);
    expect(ruleIds.map((id) => result.view.ruleCampaign[id]?.title)).toEqual([
      "kademeli",
      "kademeli",
    ]);
    expect(result.view.cardName).toEqual({ [ids.userCard]: "Plan Kart" });
    expect(result.view.unverifiedRates).toBe(true);
  });

  it("kartı olmayan kullanıcıda motor çağrılmaz", async () => {
    const other = await prisma.user.create({ data: { email: `plan-bos-${run}@kartplan.test` } });
    try {
      expect(await getMonthlyPlan(other.id, TODAY)).toEqual({ status: "incomplete" });
      expect(engine.calls).toEqual([]);
    } finally {
      await prisma.user.delete({ where: { id: other.id } });
    }
  });
});
