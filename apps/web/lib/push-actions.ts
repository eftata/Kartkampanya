"use server";

import { PushSubscriptionInput, PushUnsubscribeInput } from "@kartplan/shared";

import { track } from "@/lib/analytics";
import { requireUser } from "@/lib/auth/session";
import { deletePushSubscription, savePushSubscription, sendTestPush } from "@/lib/push";
import { RATE_LIMIT_MESSAGE, rateLimit } from "@/lib/rate-limit";

export type PushActionState = { ok?: boolean; error?: string };

/** Bu cihazda bildirimleri aç (istemci tarayıcı aboneliğini gönderir). */
export async function subscribePushAction(input: unknown): Promise<PushActionState> {
  const user = await requireUser();
  const parsed = PushSubscriptionInput.safeParse(input);
  if (!parsed.success) return { error: "Tarayıcı geçersiz bir abonelik döndürdü." };
  const result = await savePushSubscription(user.id, parsed.data);
  if (!result.ok) return { error: result.error };
  track(user.id, "push_enabled");
  return { ok: true };
}

export async function unsubscribePushAction(input: unknown): Promise<PushActionState> {
  const user = await requireUser();
  const parsed = PushUnsubscribeInput.safeParse(input);
  if (!parsed.success) return { error: "Geçersiz istek." };
  await deletePushSubscription(user.id, parsed.data.endpoint);
  return { ok: true };
}

export async function testPushAction(): Promise<PushActionState> {
  const user = await requireUser();
  if (!(await rateLimit("pushTest", user.id)).ok) return { error: RATE_LIMIT_MESSAGE };
  const result = await sendTestPush(user.id);
  return result.ok ? { ok: true } : { error: result.error };
}
