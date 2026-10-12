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
