import { PlanRequest } from "@kartplan/shared";
import { describe, expect, it } from "vitest";

import { buildPlanRequest, monthBounds, planInputHash } from "./plan-request";
import type { RuleProgress } from "./campaign-progress";
import type { PlanCampaignInput, PlanRuleInput, PlanSource, PlanSpent } from "./plan-request";

const rule = (overrides: Partial<PlanRuleInput> = {}): PlanRuleInput => ({
  id: "r1",
  categoryIds: ["market"],
  merchantIds: [],
  thresholdType: "CUMULATIVE",
  thresholdKurus: 300_000,
  txnCount: null,
  tierRepeat: false,
  rewardType: "POINTS",
  rewardKurus: 10_000,
  rewardBps: null,
  capKurus: null,
  ...overrides,
});

const campaign = (overrides: Partial<PlanCampaignInput> = {}): PlanCampaignInput => ({
  id: "c1",
  programId: "bonus",
  cardProductIds: [],
  startsAt: "2026-11-01",
  endsAt: "2026-11-30",
  joinRequired: false,
  joinDeadline: null,
  joined: false,
  rules: [rule()],
  ...overrides,
});

const source = (overrides: Partial<PlanSource> = {}): PlanSource => ({
  month: "2026-11",
  today: "2026-11-01",
  spend: [
    { categoryId: "market", monthlyKurus: 400_000, merchantIds: ["migros"] },
    { categoryId: "akaryakit", monthlyKurus: 200_000, merchantIds: [] },
  ],
  cards: [
    {
      id: "uc1",
      programId: "bonus",
      cardProductId: "platinum",
      limitKurus: null,
      baseRateBps: 50,
      earnRates: [{ categoryId: "market-online", rateBps: 100 }],
    },
    {
      id: "uc2",
      programId: "world",
      cardProductId: "gold",
      limitKurus: 1_000_000,
      baseRateBps: 25,
      earnRates: [],
    },
  ],
  campaigns: [campaign()],
  rootOf: new Map([
    ["market", "market"],
    ["market-online", "market"],
    ["akaryakit", "akaryakit"],
    ["giyim", "giyim"],
  ]),
  merchantCategory: new Map([
    ["migros", "market"],
    ["opet", "akaryakit"],
  ]),
  ...overrides,
});

describe("buildPlanRequest", () => {
  it("bütçe, kartlar ve kampanyayı sözleşmeye uygun kurar", () => {
    const request = buildPlanRequest(source());
    expect(PlanRequest.safeParse(request).success).toBe(true);
    expect(request.budget).toEqual([
      { category: "market", amount: 400_000 },
      { category: "akaryakit", amount: 200_000 },
    ]);
    expect(request.cards).toEqual([
      { id: "uc1", limit: null, baseRateBps: { "*": 50, market: 100 } },
      { id: "uc2", limit: 1_000_000, baseRateBps: { "*": 25 } },
    ]);
    expect(request.campaigns).toEqual([
      {
        id: "r1",
        cards: ["uc1"],
        categories: ["market"],
        thresholdType: "CUMULATIVE",
        threshold: 300_000,
        txnCount: null,
        tierRepeat: false,
        reward: 10_000,
        rewardBps: null,
        cap: null,
        eligible: true,
        group: null,
      },
    ]);
    expect(request.options).toEqual({ maxCards: 2, timeLimitMs: 2000 });
  });

  it("çok kurallı kampanyanın kuralları aynı grupta; taksit kuralı plana girmez", () => {
    const tiers = campaign({
      rules: [
        rule({ id: "a" }),
        rule({ id: "b", thresholdKurus: 600_000 }),
        rule({ id: "c", rewardType: "INSTALLMENT", rewardKurus: null }),
      ],
    });
    const request = buildPlanRequest(source({ campaigns: [tiers] }));
    expect(request.campaigns.map((c) => [c.id, c.group])).toEqual([
      ["a", "c1"],
      ["b", "c1"],
    ]);
  });

  it("kart kapsamı ve program dışındaki kampanya atlanır", () => {
    const outOfScope = campaign({ cardProductIds: ["classic"] });
    const otherProgram = campaign({ id: "c2", programId: "axess" });
    expect(buildPlanRequest(source({ campaigns: [outOfScope, otherProgram] })).campaigns).toEqual(
      [],
    );
  });

  it("marka kuralı yalnızca tercih edilen markada; profil dışı alan atlanır", () => {
    const merchants = campaign({
      rules: [
        rule({ id: "migros", categoryIds: [], merchantIds: ["migros"] }),
        rule({ id: "opet", categoryIds: [], merchantIds: ["opet"] }),
        rule({ id: "giyim", categoryIds: ["giyim"] }),
        rule({ id: "hepsi", categoryIds: [], merchantIds: [] }),
      ],
    });
    const request = buildPlanRequest(source({ campaigns: [merchants] }));
    expect(request.campaigns.map((c) => [c.id, c.categories])).toEqual([
      ["migros", ["market"]],
      ["hepsi", []],
    ]);
  });

  it("ayın bir kısmında geçerli kampanyada eşik büyür, oransal ödül küçülür", () => {
    const short = campaign({
      endsAt: "2026-11-10", // 30 günün 10'u
      rules: [rule({ thresholdKurus: 100_000, rewardBps: 600 })],
    });
    const [planned] = buildPlanRequest(source({ campaigns: [short] })).campaigns;
    expect(planned).toMatchObject({ threshold: 300_000, rewardBps: 200 });
    // Başka ayda olan ya da bitmiş kampanya plana girmez.
    const later = campaign({ startsAt: "2026-12-01", endsAt: "2026-12-31" });
    const ended = campaign({ endsAt: "2026-11-05" });
    expect(
      buildPlanRequest(source({ campaigns: [later, ended], today: "2026-11-06" })).campaigns,
    ).toEqual([]);
  });

  it("katılım süresi geçmiş ve katılınmamış kampanya uygun değildir", () => {
    const missed = campaign({ joinRequired: true, joinDeadline: "2026-11-05" });
    const today = "2026-11-06";
    expect(buildPlanRequest(source({ campaigns: [missed], today })).campaigns[0]?.eligible).toBe(
      false,
    );
    const joined = { ...missed, joined: true };
    expect(buildPlanRequest(source({ campaigns: [joined], today })).campaigns[0]?.eligible).toBe(
      true,
    );
  });
});

describe("monthBounds", () => {
  it.each([
    ["2026-11", "2026-11-30", 30],
    ["2028-02", "2028-02-29", 29],
  ])("%s → %s", (month, last, days) =>
    expect(monthBounds(month)).toEqual({ first: `${month}-01`, last, days }),
  );
});

describe("planInputHash", () => {
  it("anahtar sırasından bağımsız, içerik değişince değişir", () => {
    const request = buildPlanRequest(source());
    const reverse = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reverse)
        : value !== null && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .reverse()
                .map(([k, v]) => [k, reverse(v)]),
            )
          : value;
    const reordered = reverse(request) as typeof request;
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(request));
    expect(planInputHash(reordered)).toBe(planInputHash(request));
    const changed = buildPlanRequest(
      source({ spend: [{ categoryId: "market", monthlyKurus: 400_100, merchantIds: [] }] }),
    );
    expect(planInputHash(changed)).not.toBe(planInputHash(request));
    expect(planInputHash(request)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("kalan bütçeyle yeniden planlama (Faz 2)", () => {
  const progress = (patch: Partial<RuleProgress> = {}): RuleProgress => ({
    kind: "amount",
    current: 100_000,
    target: 300_000,
    tiers: 0,
    earnedKurus: 0,
    toNext: 200_000,
    complete: false,
    matched: 1,
    ...patch,
  });
  const spent = (patch: Partial<PlanSpent> = {}): PlanSpent => ({
    byCategory: new Map([["market", 150_000]]),
    byCard: new Map([["uc2", 400_000]]),
    progress: new Map([["r1", progress()]]),
    ...patch,
  });

  it("bütçe ve limit harcananı düşer; pencere bugünden başlar; eşik kalan tutara iner", () => {
    // 16 Kasım: ayın kalanı 15 gün, kampanya penceresi de 15 gün → ölçek 1.
    const request = buildPlanRequest(source({ today: "2026-11-16", spent: spent() }));
    expect(PlanRequest.safeParse(request).success).toBe(true);
    expect(request.budget).toEqual([
      { category: "market", amount: 250_000 },
      { category: "akaryakit", amount: 200_000 },
    ]);
    expect(request.cards[1]).toMatchObject({ id: "uc2", limit: 600_000 });
    expect(request.campaigns[0]).toMatchObject({ id: "r1", threshold: 200_000 });
  });

  it("kampanya ayın kalanından kısa sürerse kalan eşik ölçeklenir", () => {
    const request = buildPlanRequest(
      source({
        today: "2026-11-16",
        campaigns: [campaign({ endsAt: "2026-11-20" })], // 5 gün / ayın kalanı 15 gün
        spent: spent(),
      }),
    );
    expect(request.campaigns[0]?.threshold).toBe(600_000); // 200.000 × 15/5
  });

  it("kazanılmış kural plandan çıkar; tekrarlanan kuralda üst limitten kazanılan düşer", () => {
    expect(
      buildPlanRequest(
        source({
          spent: spent({ progress: new Map([["r1", progress({ tiers: 1, complete: true })]]) }),
        }),
      ).campaigns,
    ).toEqual([]);
    const request = buildPlanRequest(
      source({
        campaigns: [campaign({ rules: [rule({ tierRepeat: true, capKurus: 30_000 })] })],
        spent: spent({
          progress: new Map([["r1", progress({ tiers: 1, earnedKurus: 10_000, toNext: 200_000 })]]),
        }),
      }),
    );
    expect(request.campaigns[0]).toMatchObject({ threshold: 300_000, cap: 20_000 });
  });

  it("harcama yokken plan değişmez (özet aynı)", () =>
    expect(planInputHash(buildPlanRequest(source()))).toBe(
      planInputHash(buildPlanRequest(source({ spent: undefined }))),
    ));
});
