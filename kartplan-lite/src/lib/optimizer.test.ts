import { describe, expect, it } from "vitest";
import { advise } from "./advisor";
import { bestSingleCard, campaignReward, optimize } from "./optimizer";
import type { Campaign, CatalogCard } from "./types";

const TODAY = "2026-10-19";

function card(id: string, program: string, baseRateBps = 0): CatalogCard {
  return { id, bank: "", program, programName: program, name: id, baseRateBps, verified: true };
}

function camp(id: string, p: Partial<Campaign>): Campaign {
  return {
    id,
    title: id,
    summary: "",
    program: "bonus",
    cardIds: [],
    category: "market",
    benefit: "puan",
    minSpendKurus: 0,
    rewardKind: "sabit",
    rewardKurus: 0,
    rateBps: 0,
    capKurus: 0,
    requiresJoin: false,
    joinHint: "",
    url: "",
    startsAt: "2026-10-01",
    endsAt: "2026-10-31",
    status: "yayinda",
    ...p,
  };
}

const bonus = card("bonus", "bonus", 50);
const max = card("max", "maximum", 100);

describe("optimize", () => {
  it("kampanya yoksa her şey temel oranı yüksek karta", () => {
    const plan = optimize({
      cards: [bonus, max],
      spend: { market: 300_000 },
      campaigns: [],
      joined: {},
      today: TODAY,
    });
    expect(plan.lines).toEqual([{ category: "market", cardId: "max", amountKurus: 300_000 }]);
    expect(plan.totalKurus).toBe(3_000);
  });

  it("sabit kampanyanın eşiğini doldurur, kalanı en iyi karta verir", () => {
    const c = camp("k1", { minSpendKurus: 150_000, rewardKurus: 15_000 });
    const plan = optimize({
      cards: [bonus, max],
      spend: { market: 400_000 },
      campaigns: [c],
      joined: {},
      today: TODAY,
    });
    expect(plan.lines).toEqual([
      { category: "market", cardId: "max", amountKurus: 250_000 },
      { category: "market", cardId: "bonus", amountKurus: 150_000 },
    ]);
    // temel: 2500*1% + 1500*0.5% = 25 + 7.5 TL; kampanya 150 TL
    expect(plan.baseKurus).toBe(2_500 + 750);
    expect(plan.campaignKurus).toBe(15_000);
    expect(plan.outcomes[0]?.joined).toBe(false);
  });

  it("oranlı kampanya limiti kadar harcama ayırır", () => {
    const c = camp("k2", {
      program: "maximum",
      category: "akaryakit",
      rewardKind: "oran",
      rateBps: 500,
      capKurus: 10_000,
    });
    const plan = optimize({
      cards: [bonus],
      spend: { akaryakit: 300_000 },
      campaigns: [c],
      joined: {},
      today: TODAY,
    });
    expect(plan.campaignKurus).toBe(0); // kart uygun değil
    const plan2 = optimize({
      cards: [bonus, card("m0", "maximum", 0)],
      spend: { akaryakit: 300_000 },
      campaigns: [c],
      joined: {},
      today: TODAY,
    });
    expect(plan2.lines.find((l) => l.cardId === "m0")?.amountKurus).toBe(200_000);
    expect(plan2.campaignKurus).toBe(10_000);
  });

  it("eşiğe ulaşılamıyorsa 'az kaldı' önerir", () => {
    const c = camp("k3", { minSpendKurus: 200_000, rewardKurus: 10_000 });
    const plan = optimize({
      cards: [bonus],
      spend: { market: 150_000 },
      campaigns: [c],
      joined: {},
      today: TODAY,
    });
    expect(plan.campaignKurus).toBe(0);
    expect(plan.nearMisses[0]?.missingKurus).toBe(50_000);
  });

  it("'tüm harcamalar' kampanyası birden çok kategoriden doldurulur", () => {
    const c = camp("k4", {
      program: "paraf",
      category: "tumu",
      minSpendKurus: 300_000,
      rewardKurus: 12_000,
    });
    const paraf = card("paraf", "paraf", 0);
    const plan = optimize({
      cards: [paraf, max],
      spend: { market: 200_000, giyim: 150_000 },
      campaigns: [c],
      joined: {},
      today: TODAY,
    });
    const onParaf = plan.lines
      .filter((l) => l.cardId === "paraf")
      .reduce((s, l) => s + l.amountKurus, 0);
    expect(onParaf).toBe(300_000);
    expect(plan.campaignKurus).toBe(12_000);
  });

  it("süresi dolmuş, taslak ve gelecek ay kampanyalarını yok sayar", () => {
    const cs = [
      camp("a", { endsAt: "2026-10-10", rewardKurus: 1, minSpendKurus: 1 }),
      camp("b", { status: "taslak", rewardKurus: 1, minSpendKurus: 1 }),
      camp("c", { startsAt: "2026-11-01", endsAt: "2026-11-30", rewardKurus: 1, minSpendKurus: 1 }),
    ];
    const plan = optimize({
      cards: [bonus],
      spend: { market: 100_000 },
      campaigns: cs,
      joined: {},
      today: TODAY,
    });
    expect(plan.campaignKurus).toBe(0);
  });

  it("plan tek karttan kötü olamaz", () => {
    const cs = [
      camp("k1", { minSpendKurus: 150_000, rewardKurus: 15_000 }),
      camp("k2", {
        program: "maximum",
        category: "market",
        rewardKind: "oran",
        rateBps: 300,
        capKurus: 5_000,
      }),
    ];
    const input = {
      cards: [bonus, max],
      spend: { market: 500_000, giyim: 100_000 },
      campaigns: cs,
      joined: {},
      today: TODAY,
    };
    const plan = optimize(input);
    expect(plan.totalKurus).toBeGreaterThanOrEqual(bestSingleCard(input)?.totalKurus ?? 0);
    expect(plan.lines.reduce((s, l) => s + l.amountKurus, 0)).toBe(600_000);
  });
});

describe("campaignReward", () => {
  it("eşik ve limit", () => {
    const c = camp("x", {
      rewardKind: "oran",
      rateBps: 1000,
      capKurus: 6_000,
      minSpendKurus: 20_000,
    });
    expect(campaignReward(c, 19_999)).toBe(0);
    expect(campaignReward(c, 20_000)).toBe(2_000);
    expect(campaignReward(c, 100_000)).toBe(6_000);
  });
});

describe("advise", () => {
  it("tek alışverişte kartları sıralar, eksik tutarı söyler", () => {
    const c = camp("k1", { minSpendKurus: 150_000, rewardKurus: 15_000, requiresJoin: true });
    const res = advise({
      cards: [bonus, max],
      campaigns: [c],
      joined: {},
      amountKurus: 100_000,
      category: "market",
      day: TODAY,
    });
    expect(res[0]?.card.id).toBe("max");
    expect(res[1]?.campaigns[0]?.missingKurus).toBe(50_000);
    const res2 = advise({
      cards: [bonus, max],
      campaigns: [c],
      joined: {},
      amountKurus: 200_000,
      category: "market",
      day: TODAY,
    });
    expect(res2[0]?.card.id).toBe("bonus");
    expect(res2[0]?.campaigns[0]?.needsJoin).toBe(true);
  });
});
