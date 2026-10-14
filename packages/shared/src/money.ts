import { z } from "zod";

/** Tüm para tutarları kuruş cinsinden, negatif olmayan tamsayıdır. */
export const Kurus = z.number().int().nonnegative();
export type Kurus = z.infer<typeof Kurus>;

/** Baz puan: 50 = %0,5. */
export const Bps = z.number().int().nonnegative();
export type Bps = z.infer<typeof Bps>;

export function tlToKurus(tl: number): Kurus {
  return Math.round(tl * 100);
}

export function kurusToTl(kurus: Kurus): number {
  return kurus / 100;
}

/**
 * Kullanıcının yazdığı TL tutarını kuruşa çevirir. Türkçe biçimi kabul eder:
 * "50000", "50.000", "1.250,50", "1250,5". Boşsa `undefined`, geçersizse `null` döner.
 */
export function parseTlInput(raw: string): Kurus | undefined | null {
  const value = raw.replace(/\s|₺|TL/gi, "");
  if (value === "") return undefined;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(value)) return null;
  const normalized = value.replace(/\./g, "").replace(",", ".");
  return tlToKurus(Number(normalized));
}

const tlFormatter = (fractionDigits: number) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
const wholeTl = tlFormatter(0);
const fractionalTl = tlFormatter(2);

/** Kuruşu Türkçe para biçiminde gösterir: 5000000 → "₺50.000", 125050 → "₺1.250,50". */
export function formatKurus(kurus: Kurus): string {
  return (kurus % 100 === 0 ? wholeTl : fractionalTl).format(kurusToTl(kurus));
}
