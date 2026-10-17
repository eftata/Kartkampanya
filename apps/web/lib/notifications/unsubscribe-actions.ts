"use server";

import { unsubscribe } from "@/lib/notifications/prefs";
import { verifyUnsubscribe } from "@/lib/notifications/unsubscribe";

/** `/abonelik` sayfasındaki onay düğmesi (oturum istemez; bağlantı imzalı). */
export async function unsubscribeAction(
  _state: { done?: boolean; error?: string },
  formData: FormData,
): Promise<{ done?: boolean; error?: string }> {
  const verified = verifyUnsubscribe(
    {
      u: String(formData.get("u") ?? ""),
      k: String(formData.get("k") ?? ""),
      t: String(formData.get("t") ?? ""),
    },
    process.env.AUTH_SECRET ?? "",
  );
  if (!verified || !(await unsubscribe(verified.userId, verified.target))) {
    return { error: "Bağlantı geçersiz ya da süresi geçmiş." };
  }
  return { done: true };
}
