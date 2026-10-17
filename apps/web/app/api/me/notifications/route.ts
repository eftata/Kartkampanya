import { NotificationPrefsInput } from "@kartplan/shared";

import { parseJson, withUser } from "@/lib/api";
import { getNotificationPrefs, saveNotificationPrefs } from "@/lib/notifications/prefs";

export function GET() {
  return withUser(async (user) => Response.json(await getNotificationPrefs(user.id)));
}

/** Tercihlerin tamamını değiştirir. */
export function PUT(request: Request) {
  return withUser(async (user) => {
    const input = await parseJson(request, NotificationPrefsInput);
    if (!input.ok) return input.response;
    await saveNotificationPrefs(user.id, input.data);
    return Response.json(input.data);
  });
}
