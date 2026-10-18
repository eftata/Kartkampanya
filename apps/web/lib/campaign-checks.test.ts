import { formatKurus } from "@kartplan/shared";
import type { AdminCampaignInput, CampaignRuleInput } from "@kartplan/shared";
import { describe, expect, it } from "vitest";

import { campaignChecks, hasBlockingCheck, titleSimilarity } from "./campaign-checks";

const TODAY = "2026-11-01";

const rule = (patch: Partial<CampaignRuleInput> = {}): CampaignRuleInput => ({
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
  exclusions: [],
  ...patch,
});

const campaign = (patch: Partial<AdminCampaignInput> = {}): AdminCampaignInput => ({
  title: "Markette 2.500 TL'ye 100 TL",
  summary: ["Özet"],
  startsAt: "2026-11-01",
  endsAt: "2026-11-30",
  joinMethod: "APP",
  joinDeadline: null,
  cardIds: [],
  rules: [rule()],
  ...patch,
});

const messages = (input: AdminCampaignInput) =>
  campaignChecks(input, TODAY).map((check) => `${check.level}: ${check.message}`);

describe("campaignChecks", () => {
  it("olağan kampanyada uyarı yok", () => expect(messages(campaign())).toEqual([]));

  it("tarih ve katılım", () => {
    expect(messages(campaign({ joinDeadline: "2026-12-05" }))).toEqual([
      "error: Son katılım tarihi kampanya bitişinden sonra.",
    ]);
    expect(messages(campaign({ joinMethod: "AUTO", joinDeadline: "2026-11-10" }))[0]).toMatch(
      /^warning: Katılım otomatik/,
    );
    expect(messages(campaign({ endsAt: "2027-06-30" }))[0]).toMatch(/^warning: Kampanya 242 gün/);
    expect(messages(campaign({ startsAt: "2027-11-01", endsAt: "2027-11-30" }))[0]).toMatch(
      /yıl doğru mu/,
    );
  });

  it("ödül, eşik ve üst limit tutarlılığı", () => {
    expect(
      messages(campaign({ rules: [rule({ rewardKurus: 250_000, capKurus: null })] })),
    ).toContain(
      `error: ödül (${formatKurus(250_000)}) eşikten (${formatKurus(250_000)}) büyük ya da eşit.`,
    );
    expect(
      messages(campaign({ rules: [rule({ rewardKurus: 150_000, capKurus: 300_000 })] }))[0],
    ).toMatch(/^warning: ödül eşiğin yarısından fazla/);
    expect(messages(campaign({ rules: [rule({ capKurus: 5_000 })] }))).toContain(
      `error: üst limit (${formatKurus(5_000)}) tek kademenin ödülünden (${formatKurus(10_000)}) küçük.`,
    );
    expect(messages(campaign({ rules: [rule({ thresholdKurus: 0 })] }))[0]).toMatch(
      /^error: eşik 0 iken/,
    );
  });

  it("oran, üst limit ve kapsam uyarıları; çok kuralda kural numarası", () => {
    const result = messages(
      campaign({
        rules: [
          rule(),
          rule({
            rewardKurus: null,
            rewardBps: 2500,
            tierRepeat: false,
            capKurus: null,
            categoryIds: [],
          }),
        ],
      }),
    );
    expect(result).toEqual([
      "warning: Kural 2: ödül oranı %25; bu kadar yüksek oran nadirdir.",
      'warning: Kural 2: oransal ödülde üst limit yok; kaynakta "en fazla" tutarı var mı?',
      "warning: Kural 2: kategori ya da marka yok: tüm harcamalara uygulanacak.",
    ]);
  });

  it("işlem adedi eşiğinde tutar karşılaştırılmaz; taksitte limit beklenmez", () => {
    expect(
      messages(
        campaign({
          rules: [
            rule({
              thresholdType: "TXN_COUNT",
              thresholdKurus: null,
              txnCount: 3,
              rewardKurus: 20_000,
            }),
          ],
        }),
      ),
    ).toEqual([]);
    expect(
      messages(
        campaign({
          rules: [rule({ rewardType: "INSTALLMENT", rewardKurus: null, capKurus: null })],
        }),
      ),
    ).toEqual([]);
  });

  it("hasBlockingCheck", () => {
    expect(hasBlockingCheck(campaignChecks(campaign(), TODAY))).toBe(false);
    expect(hasBlockingCheck(campaignChecks(campaign({ joinDeadline: "2026-12-05" }), TODAY))).toBe(
      true,
    );
  });
});

describe("titleSimilarity", () => {
  it("aynı kampanyanın farklı yazımları benzer, farklı kampanyalar değil", () => {
    expect(
      titleSimilarity("Markette 2.500 TL'ye 100 TL Bonus!", "markette 2.500 TL'ye 100 TL bonus"),
    ).toBe(1);
    expect(
      titleSimilarity(
        "Markette 2.500 TL'ye 100 TL Bonus",
        "Markette 2.500 TL harcamaya 100 TL Bonus",
      ),
    ).toBeGreaterThanOrEqual(0.6);
    expect(titleSimilarity("Akaryakıtta %5 iade", "Markette 100 TL bonus")).toBeLessThan(0.2);
    expect(titleSimilarity("", "x")).toBe(0);
  });
});
