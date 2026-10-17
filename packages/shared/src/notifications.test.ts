import { describe, expect, it } from "vitest";

import { parseNotificationPrefs } from "./notifications";

describe("parseNotificationPrefs", () => {
  it("eksik alanlar açık, kayıtlı olanlar korunur", () => {
    expect(parseNotificationPrefs({})).toEqual({
      joinReminder: true,
      endingSoon: true,
      weeklySummary: true,
    });
    expect(parseNotificationPrefs({ weeklySummary: false })).toMatchObject({
      weeklySummary: false,
      joinReminder: true,
    });
  });

  it("bozuk değer varsayılana döner", () => {
    expect(parseNotificationPrefs({ joinReminder: "hayır", weeklySummary: false })).toEqual({
      joinReminder: true,
      endingSoon: true,
      weeklySummary: false,
    });
    expect(parseNotificationPrefs(null).endingSoon).toBe(true);
  });
});
