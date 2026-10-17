import { describe, expect, it } from "vitest";

import { draftToInput, emptyRule, kurusToInput, ruleToDraft } from "./campaign-draft";
import type { CampaignDraft } from "./campaign-draft";

const draft = (overrides: Partial<CampaignDraft> = {}): CampaignDraft => ({
  title: "Markette 2.500 TL'ye 100 TL puan",
  summary: ["Markette toplam 2.500 TL harcamaya 100 TL puan", "", ""],
  startsAt: "2026-11-01",
  endsAt: "2026-11-30",
  joinMethod: "APP",
  joinDeadline: "",
  cardIds: [],
  rules: [
    {
      ...emptyRule(),
      categoryIds: ["cat-market"],
      threshold: "2.500",
      tierRepeat: true,
      reward: "100",
      cap: "300",
      exclusions: "taksitli, nakit_avans ,",
    },
  ],
  ...overrides,
});

describe("kurusToInput", () => {
  it.each([
    [null, ""],
    [250_000, "2.500"],
    [9_990, "99,90"],
    [5, "0,05"],
  ])("%s → %s", (kurus, text) => expect(kurusToInput(kurus)).toBe(text));
});

describe("draftToInput", () => {
  it("TL ve yüzde alanlarını kuruş/bps'ye çevirir, boş özetleri atar", () => {
    const result = draftToInput(draft());
    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        summary: ["Markette toplam 2.500 TL harcamaya 100 TL puan"],
        joinDeadline: null,
        rules: [
          {
            categoryIds: ["cat-market"],
            merchantIds: [],
            thresholdType: "CUMULATIVE",
            thresholdKurus: 250_000,
            txnCount: null,
            tierRepeat: true,
            rewardType: "POINTS",
            rewardKurus: 10_000,
            rewardBps: null,
            capKurus: 30_000,
            exclusions: ["taksitli", "nakit_avans"],
          },
        ],
      }),
    });
  });

  it("kayıtlı kural forma ve geri aynı haliyle döner", () => {
    const first = draftToInput(draft());
    if (!first.ok) throw new Error(first.error);
    const again = draftToInput(draft({ rules: first.data.rules.map(ruleToDraft) }));
    expect(again).toEqual(first);
  });

  it.each([
    [{ threshold: "iki bin" }, "Kural 1 · Eşik: tutarı TL olarak yaz (ör. 2.500)."],
    [{ rewardRate: "%5,555" }, "Kural 1 · Ödül oranı: oranı yüzde olarak yaz (ör. 5)."],
    [{ threshold: "" }, "Kural 1 · Eşik: Eşik tutarını yaz."],
    [{ reward: "" }, "Kural 1 · Ödül: Ödül tutarını ya da oranını yaz."],
    [{ thresholdType: "TXN_COUNT", txnCount: "üç" }, "Kural 1 · İşlem adedi: sayı yaz."],
  ])("kural hatası %o → %s", (patch, message) => {
    const base = draft();
    expect(draftToInput({ ...base, rules: [{ ...base.rules[0]!, ...patch }] })).toEqual({
      ok: false,
      error: message,
    });
  });

  it("kampanya alanı hatalarını alan adıyla döner", () => {
    expect(draftToInput(draft({ endsAt: "2026-10-01" }))).toEqual({
      ok: false,
      error: "Bitiş: Bitiş tarihi başlangıçtan önce olamaz.",
    });
    expect(draftToInput(draft({ rules: [] }))).toEqual({
      ok: false,
      error: "Kurallar: En az bir kural olmalı.",
    });
  });
});
