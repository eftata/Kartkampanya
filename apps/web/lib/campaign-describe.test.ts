import { describe, expect, it } from "vitest";

import { describeRule } from "./campaign-describe";
import type { DescribableRule } from "./campaign-describe";

const rule = (overrides: Partial<DescribableRule> = {}): DescribableRule => ({
  categoryIds: ["c"],
  merchantIds: [],
  thresholdType: "CUMULATIVE",
  thresholdKurus: 250_000,
  txnCount: null,
  tierRepeat: false,
  rewardType: "POINTS",
  rewardKurus: 10_000,
  rewardBps: null,
  capKurus: null,
  exclusions: [],
  categoryNames: ["Market"],
  merchantNames: [],
  ...overrides,
});

describe("describeRule", () => {
  it.each([
    [{}, "Toplam ₺2.500 harcamaya ₺100 puan"],
    [{ tierRepeat: true }, "Her ₺2.500 harcamaya ₺100 puan"],
    [{ thresholdType: "SINGLE" as const }, "Tek seferde ₺2.500 ve üzeri harcamaya ₺100 puan"],
    [
      { thresholdType: "TXN_COUNT" as const, thresholdKurus: null, txnCount: 3 },
      "3 işleme ₺100 puan",
    ],
    [
      { thresholdKurus: 0, rewardType: "CASHBACK" as const, rewardKurus: null, rewardBps: 500 },
      "Harcamaya %5 iade",
    ],
    [
      { rewardType: "INSTALLMENT" as const, rewardKurus: null },
      "Toplam ₺2.500 harcamaya ek taksit",
    ],
    [
      { rewardKurus: 9_990, rewardType: "DISCOUNT" as const },
      "Toplam ₺2.500 harcamaya ₺99,90 indirim",
    ],
  ])("%o → %s", (overrides, headline) =>
    expect(describeRule(rule(overrides)).headline).toBe(headline),
  );

  it("kapsam, üst limit ve hariçleri ayrı satırlarda verir", () => {
    expect(
      describeRule(
        rule({
          merchantNames: ["Migros"],
          capKurus: 30_000,
          exclusions: ["taksitli", "nakit_avans", "hediye_karti"],
        }),
      ).details,
    ).toEqual([
      "Geçerli: Market, Migros",
      "En fazla ₺300",
      "Hariç: taksitli işlemler, nakit avans, hediye karti",
    ]);
    expect(describeRule(rule({ categoryNames: [] })).details).toEqual(["Geçerli: tüm harcamalar"]);
  });
});
