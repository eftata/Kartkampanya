import { describe, expect, it } from "vitest";

import { NotificationPrefsInput, parseNotificationPrefs } from "./notifications";

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

describe("NotificationPrefsInput", () => {
  it("üç tercih de zorunlu ve boolean", () => {
    const all = { joinReminder: true, endingSoon: false, weeklySummary: true };
    expect(NotificationPrefsInput.safeParse(all).success).toBe(true);
    expect(NotificationPrefsInput.safeParse({ joinReminder: true }).success).toBe(false);
    expect(NotificationPrefsInput.safeParse({ ...all, marketing: true }).success).toBe(false);
    expect(NotificationPrefsInput.safeParse({ ...all, endingSoon: "false" }).success).toBe(false);
  });
});
