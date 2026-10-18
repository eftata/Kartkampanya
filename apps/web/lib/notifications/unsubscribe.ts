/**
 * Tek tıkla abonelikten çıkma bağlantısı (ADR 0018). Bağlantı oturum istemez; kullanıcı ve
 * bildirim türü AUTH_SECRET ile HMAC imzalıdır, böylece başkasının aboneliği kapatılamaz.
 * Süresizdir: eski bir e-postadaki bağlantı da çalışmalı.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import type { NotificationPref } from "@kartplan/shared";

/** "all": tüm bildirimler. */
export type UnsubscribeTarget = NotificationPref | "all";
export const UNSUBSCRIBE_TARGETS: readonly UnsubscribeTarget[] = [
  "joinReminder",
  "endingSoon",
  "weeklySummary",
  "monthlyReport",
  "all",
];

function sign(userId: string, target: UnsubscribeTarget, secret: string): string {
  return createHmac("sha256", secret).update(`unsubscribe:${userId}:${target}`).digest("base64url");
}

export function unsubscribeParams(userId: string, target: UnsubscribeTarget, secret: string) {
  return new URLSearchParams({ u: userId, k: target, t: sign(userId, target, secret) });
}

/** Geçerliyse { userId, target }, değilse null. */
export function verifyUnsubscribe(
  params: { u?: string | null; k?: string | null; t?: string | null },
  secret: string,
): { userId: string; target: UnsubscribeTarget } | null {
  const { u, k, t } = params;
  if (!u || !k || !t || !secret) return null;
  if (!UNSUBSCRIBE_TARGETS.includes(k as UnsubscribeTarget)) return null;
  const target = k as UnsubscribeTarget;
  const expected = Buffer.from(sign(u, target, secret));
  const given = Buffer.from(t);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { userId: u, target };
}
