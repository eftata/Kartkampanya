import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * Zamanlanmış iş istekleri: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron bu başlığı kendisi
 * ekler). Anahtar tanımlı değilse hiçbir istek kabul edilmez.
 */
export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** E-posta bağlantılarının kökü: APP_URL, yoksa isteğin adresi. */
export function appBaseUrl(request: Request): string {
  return (process.env.APP_URL || new URL(request.url).origin).replace(/\/$/, "");
}
