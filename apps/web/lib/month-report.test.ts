import { describe, expect, it } from "vitest";

import type { MatchRule } from "./campaign-match";
import { computeMonthReport, previousMonth } from "./month-report";
import type { ReportCampaign, ReportCard, ReportTransaction } from "./month-report";

const rule = (patch: Partial<MatchRule & { id: string }> = {}): MatchRule & { id: string } => ({
  id: "r1",
  categoryIds: ["market"],
  merchantIds: [],
  thresholdType: "CUMULATIVE",
  thresholdKurus: 250_000,
  txnCount: null,
  tierRepeat: false,
  rewardType: "POINTS",
  rewardKurus: 10_000,
  rewardBps: null,
  capKurus: null,
  ...patch,
});

const campaign = (id: string, patch: Partial<ReportCampaign> = {}): ReportCampaign => ({
  id,
  title: `Kampanya ${id}`,
  programId: "bonus",
  cardProductIds: [],
  startsAt: "2026-11-01",
  endsAt: "2026-11-30",
  joinRequired: false,
  joined: false,
  rules: [rule()],
  ...patch,
});

const txn = (amountKurus: number, patch: Partial<ReportTransaction> = {}): ReportTransaction => ({
  userCardId: "uc1",
  programId: "bonus",
  cardProductId: "platinum",
  categoryId: "market",
  merchantId: null,
  amountKurus,
  date: "2026-11-10",
  ...patch,
});

const card: ReportCard = {
  id: "uc1",
  name: "Bonus",
  baseRateBps: 50,
  rates: new Map([["market", 100]]),
};

const report = (
  campaigns: ReportCampaign[],
  transactions: ReportTransaction[],
  today = "2026-12-01",
) => computeMonthReport({ month: "2026-11", today, campaigns, transactions, cards: [card] });

describe("computeMonthReport", () => {
  it("kazanılan, eşiğe ulaşılamayan ve katılmadığın için kaçırılan", () => {
    const result = report(
      [
        campaign("kazanilan"),
        campaign("esik", { rules: [rule({ thresholdKurus: 500_000, rewardKurus: 25_000 })] }),
        campaign("katilmadin", { joinRequired: true, joined: false }),
        campaign("katildin", { joinRequired: true, joined: true, rules: [rule({ id: "r2" })] }),
        campaign("akaryakit", { rules: [rule({ categoryIds: ["akaryakit"] })] }), // harcama yok
      ],
      [txn(300_000)],
    );
    expect(result.earned).toEqual([
      { id: "kazanilan", title: "Kampanya kazanilan", earnedKurus: 10_000, tiers: 1 },
      { id: "katildin", title: "Kampanya katildin", earnedKurus: 10_000, tiers: 1 },
    ]);
    expect(result.missed).toEqual([
      {
        id: "esik",
        title: "Kampanya esik",
        reason: "threshold",
        rewardKurus: 25_000,
        missing: 200_000,
        kind: "amount",
      },
      {
        id: "katilmadin",
        title: "Kampanya katilmadin",
        reason: "not_joined",
        rewardKurus: 10_000,
        missing: null,
        kind: "amount",
      },
    ]);
    expect(result.campaignEarnedKurus).toBe(20_000);
    // Temel kazanç: 3.000 TL × %1 (market oranı).
    expect(result.baseEarnedKurus).toBe(3_000);
    expect(result).toMatchObject({ closed: true, spentKurus: 300_000, ongoing: 0 });
  });

  it("ay dışında biten kampanya rapora girmez; önceki aydaki harcama kampanyaya sayılır", () => {
    const spanning = campaign("yayilan", { startsAt: "2026-10-15", endsAt: "2026-11-15" });
    const later = campaign("aralik", { endsAt: "2026-12-10" });
    const result = report([spanning, later], [txn(150_000, { date: "2026-10-20" }), txn(150_000)]);
    expect(result.earned.map((c) => c.id)).toEqual(["yayilan"]);
    // Ayın harcaması yalnızca kasım.
    expect(result.spentKurus).toBe(150_000);
  });

  it("ay bitmeden: bitmemiş kampanyalar devam ediyor sayılır", () => {
    const result = report(
      [campaign("bitmis", { endsAt: "2026-11-10" }), campaign("suruyor")],
      [txn(300_000, { date: "2026-11-05" })],
      "2026-11-20",
    );
    expect(result).toMatchObject({ closed: false, ongoing: 1 });
    expect(result.earned.map((c) => c.id)).toEqual(["bitmis"]);
  });

  it("çok kurallı kampanyada en yüksek kazanç; oransal kademenin kaçırılan ödülü", () => {
    const tiers = campaign("kademeli", {
      rules: [rule({ id: "a", thresholdKurus: 100_000, rewardKurus: 5_000 }), rule({ id: "b" })],
    });
    expect(report([tiers], [txn(300_000)]).earned[0]?.earnedKurus).toBe(10_000);
    const rate = campaign("oran", {
      rules: [
        rule({ rewardKurus: null, rewardBps: 500, thresholdKurus: 400_000, capKurus: 15_000 }),
      ],
    });
    expect(report([rate], [txn(300_000)]).missed[0]).toMatchObject({
      reason: "threshold",
      rewardKurus: 15_000, // %5 × 4.000 TL = 200 TL, üst limit 150 TL
      missing: 100_000,
    });
  });

  it("previousMonth", () => {
    expect(previousMonth("2026-11")).toBe("2026-10");
    expect(previousMonth("2027-01")).toBe("2026-12");
  });
});
