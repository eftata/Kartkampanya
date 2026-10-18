import type { MyCampaignDto, NotificationPrefs } from "@kartplan/shared";
import { describe, expect, it } from "vitest";

import { isMonday, isoWeek, pickNotifications } from "./pick";

const campaign = (id: string, overrides: Partial<MyCampaignDto> = {}): MyCampaignDto => ({
  id,
  title: id,
  summary: [],
  sourceUrl: "https://ornek-banka.test",
  bankName: "B",
  programName: "P",
  startsAt: "2026-11-01",
  endsAt: "2026-11-30",
  joinMethod: "APP",
  joinDeadline: null,
  cards: [],
  categories: [],
  rewardTypes: ["POINTS"],
  estimateKurus: 0,
  joinRequired: true,
  endingSoon: false,
  upcoming: false,
  joined: false,
  inPlan: false,
  ...overrides,
});

const allOn: NotificationPrefs = {
  joinReminder: true,
  endingSoon: true,
  weeklySummary: true,
  monthlyReport: true,
};
const pick = (campaigns: MyCampaignDto[], today: string, sent: string[] = [], prefs = allOn) =>
  pickNotifications({ campaigns, today, sent: new Set(sent), prefs });

describe("pickNotifications", () => {
  it("katılım hatırlatması: başlamış, katılım gerektiren, katılınmamış, süresi geçmemiş", () => {
    const picked = pick(
      [
        campaign("hatirlat"),
        campaign("otomatik", { joinRequired: false, joinMethod: "AUTO" }),
        campaign("katildi", { joined: true }),
        campaign("baslamadi", { startsAt: "2026-11-10" }),
        campaign("suresi-gecti", { joinDeadline: "2026-11-04" }),
        campaign("gonderildi"),
      ],
      "2026-11-05",
      ["JOIN_REMINDER:gonderildi"],
    );
    expect(picked.joinReminders.map((c) => c.id)).toEqual(["hatirlat"]);
  });

  it("son günler: yalnızca katılınan ya da plandaki, bitişe 3 gün kala", () => {
    const today = "2026-11-28"; // 28, 29, 30 → son 3 gün
    const picked = pick(
      [
        campaign("katildi", { joined: true }),
        campaign("planda", { inPlan: true, joinRequired: false }),
        campaign("ilgisiz"),
        campaign("erken", { joined: true, endsAt: "2026-12-05" }),
        campaign("gonderildi", { joined: true }),
      ],
      today,
      ["ENDING_SOON:gonderildi"],
    );
    expect(picked.endingSoon.map((c) => c.id)).toEqual(["katildi", "planda"]);
    expect(
      pick([campaign("dun", { joined: true, endsAt: "2026-11-27" })], today).endingSoon,
    ).toEqual([]);
  });

  it("haftalık özet Pazartesi ve hafta başına bir kez", () => {
    expect(pick([], "2026-11-23").weekly).toBe("2026-W48"); // Pazartesi
    expect(pick([], "2026-11-24").weekly).toBeNull();
    expect(pick([], "2026-11-23", ["WEEKLY_SUMMARY:2026-W48"]).weekly).toBeNull();
    expect(
      pickNotifications({
        campaigns: [],
        today: "2026-11-24",
        sent: new Set(),
        prefs: allOn,
        forceWeekly: true,
      }).weekly,
    ).toBe("2026-W48");
  });

  it("kapalı tercih o türü göndermez", () => {
    const off = {
      joinReminder: false,
      endingSoon: false,
      weeklySummary: false,
      monthlyReport: false,
    };
    expect(
      pick([campaign("a", { joined: true, endsAt: "2026-11-24" })], "2026-11-23", [], off),
    ).toEqual({ joinReminders: [], endingSoon: [], weekly: null, monthly: null });
  });
});

describe("tarih yardımcıları", () => {
  it.each([
    ["2026-11-23", "2026-W48"],
    ["2026-01-01", "2026-W01"], // Perşembe
    ["2027-01-01", "2026-W53"], // Cuma: önceki yılın 53. haftası
    ["2024-12-30", "2025-W01"],
  ])("isoWeek(%s) = %s", (day, week) => expect(isoWeek(day)).toBe(week));

  it("Pazartesi", () => {
    expect(isMonday("2026-11-23")).toBe(true);
    expect(isMonday("2026-11-22")).toBe(false);
  });
});

describe("ay sonu raporu", () => {
  const base = { campaigns: [], sent: new Set<string>(), prefs: allOn };
  it("ayın 1'inde geçen ay için, bir kez", () => {
    expect(pickNotifications({ ...base, today: "2026-12-01" }).monthly).toBe("2026-11");
    expect(pickNotifications({ ...base, today: "2027-01-01" }).monthly).toBe("2026-12");
    expect(pickNotifications({ ...base, today: "2026-12-02" }).monthly).toBeNull();
    expect(
      pickNotifications({ ...base, today: "2026-12-01", sent: new Set(["MONTHLY_REPORT:2026-11"]) })
        .monthly,
    ).toBeNull();
    expect(
      pickNotifications({ ...base, today: "2026-12-01", prefs: { ...allOn, monthlyReport: false } })
        .monthly,
    ).toBeNull();
    expect(pickNotifications({ ...base, today: "2026-12-15", forceMonthly: true }).monthly).toBe(
      "2026-11",
    );
  });
});
