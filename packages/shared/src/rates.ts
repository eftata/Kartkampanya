import { z } from "zod";

/** Baz puan: 50 = %0,5. Temel kazanç oranı için makul üst sınır %20. */
export const MAX_EARN_RATE_BPS = 2_000;

export const EarnRateBps = z
  .number()
  .int("Oran en fazla iki ondalık basamak olabilir (ör. %0,25).")
  .min(0, "Oran negatif olamaz.")
  .max(MAX_EARN_RATE_BPS, "Oran %20'den yüksek olamaz; yazım hatası olabilir.");

/**
 * Yüzde girişini baz puana çevirir: "0,5" → 50, "%1,25" → 125, "2" → 200.
 * Boşsa `undefined`, geçersizse (üç ondalık, harf...) `null` döner.
 */
export function parsePercentInput(raw: string): number | undefined | null {
  const value = raw.replace(/\s|%/g, "");
  if (value === "") return undefined;
  if (!/^\d+([.,]\d{1,2})?$/.test(value)) return null;
  const [whole = "0", fraction = ""] = value.split(/[.,]/);
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** Baz puanı Türkçe yüzde olarak gösterir: 50 → "%0,5", 125 → "%1,25", 0 → "%0". */
export function formatBps(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const fraction = String(bps % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return fraction ? `%${whole},${fraction}` : `%${whole}`;
}
