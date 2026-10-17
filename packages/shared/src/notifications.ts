import { z } from "zod";

/**
 * Bildirim tercihleri (`User.notifyPrefs`). Hepsi varsayılan açık: kullanıcının kendi kartları ve
 * kampanyaları hakkında hizmet bildirimleridir (pazarlama değil); her e-postada tek tıkla çıkış var.
 */
export const NotificationPrefs = z.object({
  /** Katılım gerektiren kampanya başladığında hatırlatma. */
  joinReminder: z.boolean().default(true),
  /** Katıldığın ya da planındaki kampanyanın son 3 günü. */
  endingSoon: z.boolean().default(true),
  /** Pazartesi: bu ayın planının özeti. */
  weeklySummary: z.boolean().default(true),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefs>;
export type NotificationPref = keyof NotificationPrefs;

/**
 * Veritabanındaki serbest JSON'u tercihe çevirir: alan alan; bozuk ya da eksik alan varsayılana
 * (açık) döner, diğer kayıtlı tercihler korunur.
 */
export function parseNotificationPrefs(value: unknown): NotificationPrefs {
  const source =
    value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const field = (key: NotificationPref) => (typeof source[key] === "boolean" ? source[key] : true);
  return {
    joinReminder: field("joinReminder"),
    endingSoon: field("endingSoon"),
    weeklySummary: field("weeklySummary"),
  };
}
