import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { PlanRequest, PlanResponse, planJsonSchemas } from "./plan";

/** ROADMAP → "Optimizasyon servisi" örnekleri. */
const roadmapRequest = {
  month: "2026-11",
  budget: [
    { category: "market", amount: 600000 },
    { category: "akaryakit", amount: 300000 },
    { category: "e-ticaret", amount: 400000 },
  ],
  cards: [
    { id: "A", limit: null, baseRateBps: { "*": 50 } },
    { id: "B", limit: 1000000, baseRateBps: { "*": 50 } },
    { id: "C", limit: null, baseRateBps: { "*": 50 } },
  ],
  campaigns: [
    {
      id: "K1",
      cards: ["A"],
      categories: ["market"],
      thresholdType: "CUMULATIVE",
      threshold: 250000,
      tierRepeat: true,
      reward: 10000,
      cap: 30000,
      eligible: true,
    },
  ],
  options: { maxCards: 3, timeLimitMs: 2000 },
};

describe("PlanRequest", () => {
  it("ROADMAP örneğini kabul eder; isteğe bağlı alanlar varsayılanla dolar", () => {
    const parsed = PlanRequest.parse(roadmapRequest);
    expect(parsed.campaigns[0]).toMatchObject({ txnCount: null, rewardBps: null });
    expect(PlanRequest.parse({ ...roadmapRequest, options: undefined }).options).toBeUndefined();
  });

  it.each([
    [{ month: "2026-13" }],
    [{ cards: [] }],
    [{ budget: [{ category: "market", amount: -1 }] }],
    [{ budget: [{ category: "market", amount: 1.5 }] }],
    [{ options: { maxCards: 0, timeLimitMs: 2000 } }],
    [{ extra: true }],
  ])("geçersiz istek: %o", (patch) =>
    expect(PlanRequest.safeParse({ ...roadmapRequest, ...patch }).success).toBe(false),
  );
});

describe("PlanResponse", () => {
  it("ROADMAP örnek yanıtını (ek alanlarla) kabul eder", () => {
    expect(
      PlanResponse.safeParse({
        status: "OPTIMAL",
        allocations: [
          {
            category: "market",
            card: "B",
            amount: 600000,
            campaigns: ["K4"],
            expectedReward: 28000,
          },
        ],
        campaignsHit: [{ id: "K4", tiers: 1, reward: 25000 }],
        nearMisses: [{ id: "K1", missingAmount: 250000, extraReward: 10000 }],
        unallocated: [],
        totalExpected: 66500,
        baseline: { strategy: "single_best_card", card: "A", total: 26500 },
        solver: { engine: "cp-sat", ms: 14 },
      }).success,
    ).toBe(true);
  });
});

describe("JSON Schema senkronu", () => {
  it.each(Object.entries(planJsonSchemas()))(
    "%s commit'li dosyayla aynı (değiştiyse: pnpm plan:gen)",
    (name, schema) => {
      const committed: unknown = JSON.parse(
        readFileSync(resolve(import.meta.dirname, "../schema", name), "utf8"),
      );
      expect(committed).toEqual(JSON.parse(JSON.stringify(schema)));
    },
  );
});
