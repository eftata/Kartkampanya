"use server";

import { NotificationPrefsInput } from "@kartplan/shared";

import { requireUser } from "@/lib/auth/session";
import { saveNotificationPrefs } from "@/lib/notifications/prefs";

export async function saveNotificationPrefsAction(input: unknown): Promise<{ error?: string }> {
  const user = await requireUser();
  const parsed = NotificationPrefsInput.safeParse(input);
  if (!parsed.success) return { error: "Geçersiz tercih." };
  await saveNotificationPrefs(user.id, parsed.data);
  return {};
}
