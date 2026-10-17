import { describe, expect, it } from "vitest";

import { daysBetween, estimateRule, matchCampaign, turkeyToday } from "./campaign-match";
import type { MatchCampaign, MatchRule, MatchUser, Taxonomy } from "./campaign-match";

const rule = (overrides: Partial<MatchRule> = {}): MatchRule => ({
  categoryIds: ["market"],
  merchantIds: [],
  thresholdType: "CUMULATIVE",
  thresholdKurus: 250_000, // 2.500 TL
  txnCount: null,
  tierRepeat: true,
  rewardType: "POINTS",
  rewardKurus: 10_000, // 100 TL
  rewardBps: null,
  capKurus: 30_000, // 300 TL
  ...overrides,
});

const campaign = (overrides: Partial<MatchCampaign> = {}): MatchCampaign => ({
  programId: "bonus",
  cardProductIds: [],
  startsAt: "2026-11-01",
  endsAt: "2026-11-30",
  joinDeadline: null,
  rules: [rule()],
  ...overrides,
});

const user: MatchUser = {
  cards: [
    { id: "uc-platinum", cardProductId: "bonus-platinum", programId: "bonus" },
    { id: "uc-world", cardProductId: "world-gold", programId: "world" },
  ],
  spend: new Map([
    ["market", 400_000], // 4.000 TL / ay
    ["akaryakit", 150_000],
  ]),
};

const taxonomy: Taxonomy = {
  rootOf: new Map([
    ["market", "market"],
    ["market-online", "market"],
    ["akaryakit", "akaryakit"],
    ["giyim", "giyim"],
  ]),
  merchantRoot: new Map([
    ["migros", "market"],
    ["zara", "giyim"],
  ]),
};

const TODAY = "2026-11-01"; // kampanya 30 gün: kalan harcama = aylık harcama

describe("matchCampaign", () => {
  it("programdaki kartla ve profildeki kategoriyle eşleşir", () => {
    expect(matchCampaign(campaign(), user, taxonomy, TODAY)).toEqual({
      cardIds: ["uc-platinum"],
      categoryIds: ["market"],
      rewardTypes: ["POINTS"],
      estimateKurus: 10_000, // 4.000 TL harcamada her 2.500 TL eşiği 1 kez: 100 TL
    });
  });

  it("kullanıcının programda kartı yoksa ya da kapsam dışındaysa eşleşmez", () => {
    expect(matchCampaign(campaign({ programId: "maximum" }), user, taxonomy, TODAY)).toBeNull();
    expect(
      matchCampaign(campaign({ cardProductIds: ["bonus-gold"] }), user, taxonomy, TODAY),
    ).toBeNull();
    expect(
      matchCampaign(campaign({ cardProductIds: ["bonus-platinum"] }), user, taxonomy, TODAY)
        ?.cardIds,
    ).toEqual(["uc-platinum"]);
  });

  it("alt kategori ve marka ana kategoriye göre eşleşir; profilde olmayan alan eşleşmez", () => {
    const sub = campaign({ rules: [rule({ categoryIds: ["market-online"] })] });
    expect(matchCampaign(sub, user, taxonomy, TODAY)?.categoryIds).toEqual(["market"]);
    const merchant = campaign({ rules: [rule({ categoryIds: [], merchantIds: ["migros"] })] });
    expect(matchCampaign(merchant, user, taxonomy, TODAY)?.categoryIds).toEqual(["market"]);
    const clothes = campaign({ rules: [rule({ categoryIds: ["giyim"] })] });
    expect(matchCampaign(clothes, user, taxonomy, TODAY)).toBeNull();
    const zara = campaign({ rules: [rule({ categoryIds: [], merchantIds: ["zara"] })] });
    expect(matchCampaign(zara, user, taxonomy, TODAY)).toBeNull();
  });

  it("kategorisiz kural tüm harcamalara uyar", () => {
    const all = campaign({ rules: [rule({ categoryIds: [], capKurus: null })] });
    const match = matchCampaign(all, user, taxonomy, TODAY);
    expect(match?.categoryIds.sort()).toEqual(["akaryakit", "market"]);
    expect(match?.estimateKurus).toBe(20_000); // 5.500 TL → 2 × 100 TL
  });

  it("bitmiş ya da katılım süresi geçmiş kampanya eşleşmez; son gün hâlâ geçerli", () => {
    expect(matchCampaign(campaign(), user, taxonomy, "2026-12-01")).toBeNull();
    expect(matchCampaign(campaign(), user, taxonomy, "2026-11-30")).not.toBeNull();
    expect(
      matchCampaign(campaign({ joinDeadline: "2026-11-10" }), user, taxonomy, "2026-11-11"),
    ).toBeNull();
  });

  it("tahmin uyan kuralların en yükseğidir (kademeler toplanmaz)", () => {
    const tiers = campaign({
      rules: [
        rule({ thresholdKurus: 100_000, rewardKurus: 5_000, tierRepeat: false, capKurus: null }),
        rule({ thresholdKurus: 300_000, rewardKurus: 15_000, tierRepeat: false, capKurus: null }),
      ],
    });
    expect(matchCampaign(tiers, user, taxonomy, TODAY)?.estimateKurus).toBe(15_000);
  });

  it("kalan süreye göre harcama ölçeklenir", () => {
    // 10 gün kaldı: 4.000 TL × 10/30 = 1.333 TL < 2.500 TL eşik
    expect(matchCampaign(campaign(), user, taxonomy, "2026-11-21")?.estimateKurus).toBe(0);
  });
});

describe("estimateRule", () => {
  it.each([
    ["toplam, tekrarlı, tavanlı", rule(), 1_000_000, 30_000],
    ["toplam, eşik altı", rule(), 200_000, 0],
    ["oransal", rule({ rewardKurus: null, rewardBps: 500, capKurus: 10_000 }), 300_000, 10_000],
    [
      "oransal, tavansız",
      rule({ rewardKurus: null, rewardBps: 500, capKurus: null }),
      300_000,
      15_000,
    ],
    [
      "tek seferlik: aylık harcama eşiği geçiyorsa bir kez",
      rule({ thresholdType: "SINGLE" }),
      900_000,
      10_000,
    ],
    [
      "işlem adedi: harcama varsa",
      rule({ thresholdType: "TXN_COUNT", thresholdKurus: null, txnCount: 3 }),
      1,
      10_000,
    ],
    ["taksit", rule({ rewardType: "INSTALLMENT", rewardKurus: null }), 1_000_000, 0],
  ])("%s", (_name, r, spend, expected) => expect(estimateRule(r, spend, spend)).toBe(expected));
});

describe("tarih yardımcıları", () => {
  it("gün sayısı her iki ucu da sayar", () => {
    expect(daysBetween("2026-11-01", "2026-11-30")).toBe(30);
    expect(daysBetween("2026-11-30", "2026-11-30")).toBe(1);
  });

  it("Türkiye günü UTC+3'tür", () => {
    expect(turkeyToday(new Date("2026-11-30T20:59:00Z"))).toBe("2026-11-30");
    expect(turkeyToday(new Date("2026-11-30T21:00:00Z"))).toBe("2026-12-01");
  });
});
