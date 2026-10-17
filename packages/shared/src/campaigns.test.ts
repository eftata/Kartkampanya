import { describe, expect, it } from "vitest";

import {
  AdminCampaignInput,
  AdminCampaignReview,
  CampaignRuleInput,
  CampaignStatusInput,
  DateOnly,
} from "./campaigns";

const rule = (overrides: Partial<CampaignRuleInput> = {}): CampaignRuleInput => ({
  categoryIds: ["market"],
  merchantIds: [],
  thresholdType: "CUMULATIVE",
  thresholdKurus: 250_000,
  txnCount: null,
  tierRepeat: true,
  rewardType: "POINTS",
  rewardKurus: 10_000,
  rewardBps: null,
  capKurus: 30_000,
  exclusions: ["taksitli"],
  ...overrides,
});

const campaign = (overrides: Partial<AdminCampaignInput> = {}): AdminCampaignInput => ({
  title: "Markette 2.500 TL'ye 100 TL puan",
  summary: ["Markette toplam 2.500 TL harcamaya 100 TL puan"],
  startsAt: "2026-11-01",
  endsAt: "2026-11-30",
  joinMethod: "APP",
  joinDeadline: "2026-11-30",
  cardIds: [],
  rules: [rule()],
  ...overrides,
});

const firstError = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe("DateOnly", () => {
  it.each(["2026-11-30", "2028-02-29"])("%s geçerlidir", (value) =>
    expect(DateOnly.safeParse(value).success).toBe(true),
  );
  it.each(["2026-02-30", "30.11.2026", "2026-13-01", ""])("%s geçersizdir", (value) =>
    expect(DateOnly.safeParse(value).success).toBe(false),
  );
});

describe("CampaignRuleInput", () => {
  it("geçerli kuralı kabul eder", () =>
    expect(CampaignRuleInput.safeParse(rule()).success).toBe(true));

  it.each([
    [{ thresholdKurus: null }, "Eşik tutarını yaz."],
    [{ thresholdType: "TXN_COUNT" as const, txnCount: null }, "İşlem adedini yaz."],
    [{ rewardKurus: null }, "Ödül tutarını ya da oranını yaz."],
    [{ rewardKurus: null, rewardBps: 10_001 }, "Ödül oranı %100'den yüksek olamaz."],
    [{ categoryIds: ["a", "a"] }, "Aynı kayıt iki kez seçilmiş."],
  ])("%o → %s", (overrides, message) =>
    expect(firstError(CampaignRuleInput.safeParse(rule(overrides)))).toBe(message),
  );

  it("taksit ödülünde tutar gerekmez; işlem adedi eşiğinde tutar gerekmez", () => {
    expect(
      CampaignRuleInput.safeParse(rule({ rewardType: "INSTALLMENT", rewardKurus: null })).success,
    ).toBe(true);
    expect(
      CampaignRuleInput.safeParse(
        rule({ thresholdType: "TXN_COUNT", thresholdKurus: null, txnCount: 3 }),
      ).success,
    ).toBe(true);
  });
});

describe("AdminCampaignInput", () => {
  it("geçerli kampanyayı kabul eder", () =>
    expect(AdminCampaignInput.safeParse(campaign()).success).toBe(true));

  it.each([
    [{ endsAt: "2026-10-31" }, "Bitiş tarihi başlangıçtan önce olamaz."],
    [{ rules: [] }, "En az bir kural olmalı."],
    [{ summary: [] }, "En az bir özet maddesi yaz."],
    [{ summary: ["a", "b", "c", "d"] }, "En fazla 3 özet maddesi olabilir."],
  ])("%o → %s", (overrides, message) =>
    expect(firstError(AdminCampaignInput.safeParse(campaign(overrides)))).toBe(message),
  );
});

describe("AdminCampaignReview", () => {
  it("kaydet/onayla kampanya ister, reddet istemez", () => {
    expect(AdminCampaignReview.safeParse({ action: "approve", campaign: campaign() }).success).toBe(
      true,
    );
    expect(AdminCampaignReview.safeParse({ action: "approve" }).success).toBe(false);
    expect(AdminCampaignReview.safeParse({ action: "reject", reason: "Tekrar" }).success).toBe(
      true,
    );
    expect(AdminCampaignReview.safeParse({ action: "publish" }).success).toBe(false);
  });
});

describe("CampaignStatusInput", () => {
  it("en az bir işaret ister, bilinmeyen alanı reddeder", () => {
    expect(CampaignStatusInput.safeParse({ joined: true }).success).toBe(true);
    expect(CampaignStatusInput.safeParse({ inPlan: false }).success).toBe(true);
    expect(firstError(CampaignStatusInput.safeParse({}))).toBe("joined ya da inPlan gönderilmeli.");
    expect(CampaignStatusInput.safeParse({ joined: "evet" }).success).toBe(false);
    expect(CampaignStatusInput.safeParse({ joined: true, progressKurus: 5 }).success).toBe(false);
  });
});
