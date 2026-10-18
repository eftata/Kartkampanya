/**
 * Hangi bildirim gidecek (saf; ADR 0018). Girdi kullanıcıya eşleşen kampanyalar (`getMyCampaigns`),
 * daha önce gönderilenler ve tercihler.
 *
 * - Katılım hatırlatma: katılım gerektiren, başlamış, son katılım günü geçmemiş, katılınmamış.
 * - Son günler: katıldığın ya da planındaki kampanyanın son 3 günü (bitiş günü dahil).
 * - Haftalık özet: Pazartesi, ISO haftası başına bir kez.
 * - Ay sonu raporu: ayın 1'inde, geçen ay için bir kez (harcama girilmişse; çalıştırıcı denetler).
 */
import type { MyCampaignDto, NotificationPrefs } from "@kartplan/shared";

import { daysBetween } from "@/lib/campaign-match";
import { previousMonth } from "@/lib/month-report";

export type NotificationKind =
  "JOIN_REMINDER" | "ENDING_SOON" | "WEEKLY_SUMMARY" | "MONTHLY_REPORT";

export const ENDING_SOON_DAYS = 3;

/** ISO 8601 hafta: "2026-W47" (hafta Pazartesi başlar). */
export function isoWeek(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday); // haftanın Perşembesi yılı belirler
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const isMonday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay() === 1;

export type Picked = {
  joinReminders: MyCampaignDto[];
  endingSoon: MyCampaignDto[];
  /** Haftalık özetin anahtarı (gönderilecekse). */
  weekly: string | null;
  /** Raporu gidecek ay ("2026-10"; gönderilecekse). */
  monthly: string | null;
};

export function pickNotifications({
  campaigns,
  today,
  sent,
  prefs,
  forceWeekly = false,
  forceMonthly = false,
}: {
  campaigns: MyCampaignDto[];
  today: string;
  /** Gönderilmişler: `${kind}:${key}`. */
  sent: Set<string>;
  prefs: NotificationPrefs;
  forceWeekly?: boolean;
  forceMonthly?: boolean;
}): Picked {
  const notSent = (kind: NotificationKind, key: string) => !sent.has(`${kind}:${key}`);
  const joinReminders = prefs.joinReminder
    ? campaigns.filter(
        (c) =>
          c.joinRequired &&
          !c.joined &&
          c.startsAt <= today &&
          (c.joinDeadline === null || c.joinDeadline >= today) &&
          notSent("JOIN_REMINDER", c.id),
      )
    : [];
  const endingSoon = prefs.endingSoon
    ? campaigns.filter(
        (c) =>
          (c.joined || c.inPlan) &&
          c.endsAt >= today &&
          daysBetween(today, c.endsAt) <= ENDING_SOON_DAYS &&
          notSent("ENDING_SOON", c.id),
      )
    : [];
  const week = isoWeek(today);
  const weekly =
    prefs.weeklySummary && (isMonday(today) || forceWeekly) && notSent("WEEKLY_SUMMARY", week)
      ? week
      : null;
  const lastMonth = previousMonth(today.slice(0, 7));
  const monthly =
    prefs.monthlyReport &&
    (today.endsWith("-01") || forceMonthly) &&
    notSent("MONTHLY_REPORT", lastMonth)
      ? lastMonth
      : null;
  return { joinReminders, endingSoon, weekly, monthly };
}
