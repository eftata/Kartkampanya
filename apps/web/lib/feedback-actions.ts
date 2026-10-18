"use server";

import { FeedbackInput, FeedbackStatus } from "@kartplan/shared";
import { refresh } from "next/cache";

import { requireAdmin, requireUser } from "@/lib/auth/session";
import { createFeedback, setFeedbackStatus } from "@/lib/feedback";
import { rateLimit } from "@/lib/rate-limit";

export type FeedbackFormState = { ok?: boolean; error?: string };

/** Geri bildirim formu (hata alınca girilen değerler korunur: istemci `startTransition` ile çağırır). */
export async function sendFeedbackAction(input: unknown): Promise<FeedbackFormState> {
  const user = await requireUser();
  const parsed = FeedbackInput.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi." };
  }
  if (!(await rateLimit("feedback", user.id)).ok) {
    return { error: "Kısa sürede çok fazla geri bildirim gönderdin; biraz sonra yeniden dene." };
  }
  const result = await createFeedback(user.id, parsed.data);
  if (!result.ok) return { error: result.error };
  refresh();
  return { ok: true };
}

/** Admin: okundu / tamamlandı / yeni. */
export async function setFeedbackStatusAction(id: string, status: unknown) {
  const admin = await requireAdmin();
  const parsed = FeedbackStatus.safeParse(status);
  if (!parsed.success) return { error: "Geçersiz durum." };
  const result = await setFeedbackStatus(admin, id, parsed.data);
  if (!result.ok) return { error: result.error };
  refresh();
  return {};
}
