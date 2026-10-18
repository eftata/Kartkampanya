import { describe, expect, it } from "vitest";

import type { MatchRule } from "./campaign-match";
import type { ProgressTransaction } from "./campaign-progress";
import { advisePurchase } from "./purchase-advisor";
import type { AdvisorCampaign, AdvisorCard, Purchase } from "./purchase-advisor";

const rule = (patch: Partial<MatchRule & { id: string }> = {}): MatchRule & { id: string } => ({
  id: "r",
  categoryIds: ["elektronik"],
  merchantIds: [],
  thresholdType: "CUMULATIVE",
  thresholdKurus: 300_000,
  txnCount: null,
  tierRepeat: false,
  rewardType: "POINTS",
  rewardKurus: 20_000,
  rewardBps: null,
  capKurus: null,
  ...patch,
});

const campaign = (id: string, patch: Partial<AdvisorCampaign> = {}): AdvisorCampaign => ({
  id,
  title: `Kampanya ${id}`,
  programId: "bonus",
  cardProductIds: [],
  startsAt: "2026-11-01",
  endsAt: "2026-11-30",
  joinRequired: false,
  joined: false,
  joinDeadline: null,
  rules: [rule()],
  ...patch,
});

const card = (id: string, programId: string, patch: Partial<AdvisorCard> = {}): AdvisorCard => ({
  id,
  name: `Kart ${id}`,
  programId,
  cardProductId: `${programId}-p`,
  baseRateBps: 50,
  rates: new Map(),
  limitKurus: null,
  spentThisMonthKurus: 0,
  ...patch,
});

const phone: Purchase = {
  amountKurus: 400_000,
  categoryId: "elektronik",
  merchantId: null,
  date: "2026-11-10",
};
const txn = (programId: string, amountKurus: number): ProgressTransaction => ({
  programId,
  cardProductId: `${programId}-p`,
  categoryId: "elektronik",
  merchantId: null,
  amountKurus,
  date: "2026-11-05",
});

describe("advisePurchase", () => {
  it("eşiği bu alışverişle geçilen kampanya kazandırır; kartlar kazanca göre sıralı", () => {
    const result = advisePurchase({
      purchase: phone,
      cards: [card("world", "world", { baseRateBps: 100 }), card("bonus", "bonus")],
      campaigns: [campaign("bonus-elektronik")],
      transactions: [],
    });
    expect(result.map((r) => [r.cardId, r.totalKurus, r.baseKurus])).toEqual([
      ["bonus", 22_000, 2_000], // 200 TL kampanya + %0,5
      ["world", 4_000, 4_000], // yalnızca %1 temel
    ]);
    expect(result[0]?.campaigns).toEqual([
      { id: "bonus-elektronik", title: "Kampanya bonus-elektronik", gainKurus: 20_000 },
    ]);
  });

  it("eşiği zaten geçilmiş tekrarsız kampanya ek kazanç vermez; kısmi ilerleme sayılır", () => {
    const done = advisePurchase({
      purchase: phone,
      cards: [card("bonus", "bonus", { baseRateBps: 0 })],
      campaigns: [campaign("c")],
      transactions: [txn("bonus", 300_000)],
    });
    expect(done[0]?.totalKurus).toBe(0);
    const partial = advisePurchase({
      purchase: { ...phone, amountKurus: 100_000 },
      cards: [card("bonus", "bonus", { baseRateBps: 0 })],
      campaigns: [campaign("c")],
      transactions: [txn("bonus", 250_000)],
    });
    expect(partial[0]?.totalKurus).toBe(20_000); // 2.500 + 1.000 ≥ 3.000
  });

  it("katılım gerekiyorsa ayrı listelenir; süresi geçmişse hiç", () => {
    const join = campaign("katil", { joinRequired: true, joinDeadline: "2026-11-20" });
    const [advice] = advisePurchase({
      purchase: phone,
      cards: [card("bonus", "bonus", { baseRateBps: 0 })],
      campaigns: [join],
      transactions: [],
    });
    expect(advice).toMatchObject({
      totalKurus: 0,
      ifJoined: [{ id: "katil", gainKurus: 20_000, joinDeadline: "2026-11-20" }],
    });
    const late = advisePurchase({
      purchase: { ...phone, date: "2026-11-25" },
      cards: [card("bonus", "bonus")],
      campaigns: [join],
      transactions: [],
    });
    expect(late[0]?.ifJoined).toEqual([]);
  });

  it("limit yetmeyen kart sona; ek taksit kampanyası işaretlenir; tarih dışı kampanya yok", () => {
    const result = advisePurchase({
      purchase: phone,
      cards: [
        card("bonus", "bonus", { limitKurus: 1_000_000, spentThisMonthKurus: 700_000 }),
        card("world", "world"),
      ],
      campaigns: [
        campaign("taksit", {
          programId: "world",
          rules: [rule({ rewardType: "INSTALLMENT", rewardKurus: null, thresholdKurus: 100_000 })],
        }),
        campaign("eski", { endsAt: "2026-11-05" }),
      ],
      transactions: [],
    });
    expect(result.map((r) => [r.cardId, r.overLimit])).toEqual([
      ["world", false],
      ["bonus", true],
    ]);
    expect(result[0]?.installments).toEqual([{ id: "taksit", title: "Kampanya taksit" }]);
    expect(result[1]?.campaigns).toEqual([]);
  });

  it("çok kurallı kampanyada alternatif kademe: en yüksek kazanç farkı", () => {
    const tiers = campaign("kademe", {
      rules: [
        rule({ id: "a", thresholdKurus: 100_000, rewardKurus: 5_000 }),
        rule({ id: "b", thresholdKurus: 500_000, rewardKurus: 40_000 }),
      ],
    });
    const [advice] = advisePurchase({
      purchase: phone,
      cards: [card("bonus", "bonus", { baseRateBps: 0 })],
      campaigns: [tiers],
      transactions: [txn("bonus", 150_000)], // a kazanılmış (50 TL)
    });
    expect(advice?.totalKurus).toBe(35_000); // 400 TL'ye çıkar: 5.500 TL → b (400) − a (50)
  });
});
