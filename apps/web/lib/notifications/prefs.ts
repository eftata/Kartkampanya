import "server-only";

import { getPrisma } from "@kartplan/db";
import { parseNotificationPrefs } from "@kartplan/shared";
import type { NotificationPrefs } from "@kartplan/shared";

import type { UnsubscribeTarget } from "@/lib/notifications/unsubscribe";

export async function getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: { notifyPrefs: true },
  });
  return parseNotificationPrefs(user?.notifyPrefs);
}

export async function saveNotificationPrefs(userId: string, prefs: NotificationPrefs) {
  await getPrisma().user.update({ where: { id: userId }, data: { notifyPrefs: prefs } });
}

/** Abonelikten çıkma: tek tür ya da hepsi kapanır. Kullanıcı yoksa false. */
export async function unsubscribe(userId: string, target: UnsubscribeTarget): Promise<boolean> {
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: { notifyPrefs: true },
  });
  if (!user) return false;
  const prefs = parseNotificationPrefs(user.notifyPrefs);
  const next: NotificationPrefs =
    target === "all"
      ? { joinReminder: false, endingSoon: false, weeklySummary: false, monthlyReport: false }
      : { ...prefs, [target]: false };
  await saveNotificationPrefs(userId, next);
  return true;
}
