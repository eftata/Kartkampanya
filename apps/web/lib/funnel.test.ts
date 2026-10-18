import { describe, expect, it } from "vitest";

import { computeFunnel, funnelCohorts, percent, returnedInWeek2, weekOf } from "./funnel";
import type { FunnelUser } from "./funnel";

// Varsayılan saat UTC 07:00 = Türkiye 10:00 (aynı gün).
const at = (day: string, hour = 7) => new Date(`${day}T${String(hour).padStart(2, "0")}:00:00Z`);
const NOW = at("2026-11-30");

const user = (signup: string, extra: Partial<FunnelUser> = {}): FunnelUser => ({
  signedUpAt: at(signup),
  firstCardAt: null,
  firstPlanViewAt: null,
  activeDays: [signup],
  ...extra,
});

describe("returnedInWeek2", () => {
  it("kayıttan sonraki 7–13. gün", () => {
    expect(returnedInWeek2(user("2026-11-02", { activeDays: ["2026-11-08"] }))).toBe(false); // 6
    expect(returnedInWeek2(user("2026-11-02", { activeDays: ["2026-11-09"] }))).toBe(true); // 7
    expect(returnedInWeek2(user("2026-11-02", { activeDays: ["2026-11-15"] }))).toBe(true); // 13
    expect(returnedInWeek2(user("2026-11-02", { activeDays: ["2026-11-16"] }))).toBe(false); // 14
  });

  it("gece yarısına yakın kayıt Türkiye gününe göre", () => {
    // UTC 22:30 = Türkiye'de ertesi gün 01:30.
    const late = { ...user("2026-11-02"), signedUpAt: new Date("2026-11-01T22:30:00Z") };
    // Kayıt günü 2 Kasım: 15 Kasım 13. gün (UTC'ye göre 1 Kasım sayılsaydı 14. gün olurdu).
    expect(returnedInWeek2({ ...late, activeDays: ["2026-11-15"] })).toBe(true);
    expect(returnedInWeek2({ ...late, activeDays: ["2026-11-08"] })).toBe(false); // 6. gün
  });
});

describe("computeFunnel", () => {
  it("adımlar ve yalnızca ölçülebilenler arasında 2. hafta", () => {
    const users = [
      user("2026-11-02", {
        firstCardAt: at("2026-11-02"),
        firstPlanViewAt: at("2026-11-02"),
        activeDays: ["2026-11-02", "2026-11-10"],
      }),
      user("2026-11-03", { firstCardAt: at("2026-11-04") }),
      user("2026-11-25", { activeDays: ["2026-11-25"] }), // 5 günlük: ölçülemez
    ];
    expect(computeFunnel(users, NOW)).toEqual({
      steps: [
        { key: "signup", label: "Kayıt oldu", count: 3 },
        { key: "card", label: "Kart girdi", count: 2 },
        { key: "plan", label: "Planı gördü", count: 1 },
      ],
      week2: { eligible: 2, returned: 1 },
    });
  });

  it("14. gün dolmadan ölçülmez", () => {
    // 2026-11-16 kayıt; bugün 11-30 → 14. gün: ölçülebilir. 11-17 → 13. gün: değil.
    expect(computeFunnel([user("2026-11-16")], NOW).week2.eligible).toBe(1);
    expect(computeFunnel([user("2026-11-17")], NOW).week2.eligible).toBe(0);
  });
});

describe("kohortlar", () => {
  it("haftanın pazartesisi", () => {
    expect(weekOf(at("2026-11-02"))).toBe("2026-11-02");
    expect(weekOf(at("2026-11-08"))).toBe("2026-11-02"); // pazar
    expect(weekOf(at("2026-11-09"))).toBe("2026-11-09");
  });

  it("kayıt haftasına göre, yeniden eskiye", () => {
    const cohorts = funnelCohorts(
      [user("2026-11-02"), user("2026-11-10"), user("2026-11-04")],
      NOW,
    );
    expect(cohorts.map((c) => [c.week, c.steps[0]?.count])).toEqual([
      ["2026-11-09", 1],
      ["2026-11-02", 2],
    ]);
  });

  it("percent", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBeNull();
  });
});
