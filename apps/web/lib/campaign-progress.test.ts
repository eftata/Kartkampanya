import { describe, expect, it } from "vitest";

import { matchesRule, ruleProgress } from "./campaign-progress";
import type { ProgressCampaign, ProgressTransaction } from "./campaign-progress";
import type { MatchRule } from "./campaign-match";

const campaign: ProgressCampaign = {
  programId: "bonus",
  cardProductIds: [],
  startsAt: "2026-11-01",
  endsAt: "2026-11-30",
};

const rule = (patch: Partial<MatchRule> = {}): MatchRule => ({
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

const txn = (
  amountKurus: number,
  patch: Partial<ProgressTransaction> = {},
): ProgressTransaction => ({
  programId: "bonus",
  cardProductId: "platinum",
  categoryId: "market",
  merchantId: null,
  amountKurus,
  date: "2026-11-05",
  ...patch,
});

describe("matchesRule", () => {
  const root = (id: string) => (id === "online-market" ? "market" : id);
  it.each([
    ["eşleşir", txn(1), true],
    ["tarih dışı", txn(1, { date: "2026-10-31" }), false],
    ["başka program", txn(1, { programId: "world" }), false],
    ["başka kategori", txn(1, { categoryId: "giyim" }), false],
  ])("%s", (_, item, expected) => expect(matchesRule(rule(), campaign, item, root)).toBe(expected));

  it("kart kapsamı, alt kategori ve marka", () => {
    const scoped = { ...campaign, cardProductIds: ["gold"] };
    expect(matchesRule(rule(), scoped, txn(1), root)).toBe(false);
    expect(matchesRule(rule({ categoryIds: ["online-market"] }), campaign, txn(1), root)).toBe(
      true,
    );
    const brand = rule({ categoryIds: [], merchantIds: ["migros"] });
    expect(matchesRule(brand, campaign, txn(1), root)).toBe(false);
    expect(matchesRule(brand, campaign, txn(1, { merchantId: "migros" }), root)).toBe(true);
    expect(
      matchesRule(rule({ categoryIds: [] }), campaign, txn(1, { categoryId: "giyim" }), root),
    ).toBe(true);
  });
});

describe("ruleProgress", () => {
  it("toplam harcama, tekrarsız: kalan ve tamamlanma", () => {
    expect(ruleProgress(rule(), campaign, [txn(100_000), txn(50_000)])).toEqual({
      kind: "amount",
      current: 150_000,
      target: 250_000,
      tiers: 0,
      earnedKurus: 0,
      toNext: 100_000,
      complete: false,
      matched: 2,
    });
    expect(ruleProgress(rule(), campaign, [txn(300_000)])).toMatchObject({
      tiers: 1,
      earnedKurus: 10_000,
      toNext: null,
      complete: true,
    });
  });

  it("tekrarlanan kademe ve üst limit", () => {
    const repeat = rule({ tierRepeat: true, capKurus: 30_000 });
    expect(ruleProgress(repeat, campaign, [txn(600_000)])).toMatchObject({
      tiers: 2,
      earnedKurus: 20_000,
      toNext: 150_000,
      complete: false,
    });
    expect(ruleProgress(repeat, campaign, [txn(2_000_000)])).toMatchObject({
      tiers: 3, // üst limit 3 kademe
      earnedKurus: 30_000,
      toNext: null,
      complete: true,
    });
  });

  it("oransal ödül eşik aşılınca tüm harcamaya, üst limitle", () => {
    const rate = rule({
      rewardKurus: null,
      rewardBps: 500,
      thresholdKurus: 100_000,
      capKurus: 20_000,
    });
    expect(ruleProgress(rate, campaign, [txn(50_000)]).earnedKurus).toBe(0);
    expect(ruleProgress(rate, campaign, [txn(200_000)]).earnedKurus).toBe(10_000);
    expect(ruleProgress(rate, campaign, [txn(1_000_000)])).toMatchObject({
      earnedKurus: 20_000,
      complete: true,
    });
  });

  it("tek seferde harcama", () => {
    const single = rule({ thresholdType: "SINGLE", thresholdKurus: 100_000, tierRepeat: true });
    expect(ruleProgress(single, campaign, [txn(60_000), txn(120_000), txn(150_000)])).toMatchObject(
      {
        kind: "single",
        current: 150_000,
        tiers: 2,
        earnedKurus: 20_000,
        toNext: 100_000,
      },
    );
  });

  it("işlem adedi; taksit ödülü 0", () => {
    const count = rule({
      thresholdType: "TXN_COUNT",
      thresholdKurus: null,
      txnCount: 3,
      rewardType: "INSTALLMENT",
      rewardKurus: null,
    });
    expect(ruleProgress(count, campaign, [txn(1), txn(1)])).toMatchObject({
      kind: "count",
      current: 2,
      target: 3,
      toNext: 1,
      earnedKurus: 0,
    });
    expect(ruleProgress(count, campaign, [txn(1), txn(1), txn(1)])).toMatchObject({
      tiers: 1,
      complete: true,
    });
  });
});
