import { z } from "zod";

import { CardType } from "./cards";
import { Kurus } from "./money";
import { EarnRateBps } from "./rates";

const Name = (max: number) =>
  z
    .string()
    .trim()
    .min(2, "En az 2 karakter olmalı.")
    .max(max, `En fazla ${max} karakter olabilir.`);

const Slug = z
  .string()
  .trim()
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Kısa ad yalnızca küçük harf, rakam ve tire içerebilir (ör. bonus).",
  )
  .max(40);

/** 1 puanın TL karşılığı; en fazla 4 ondalık (Decimal(10,4)). Nokta ya da virgül kabul edilir. */
const PointValueTL = z
  .string()
  .trim()
  .transform((value) => value.replace(",", "."))
  .refine((value) => /^\d{1,6}(\.\d{1,4})?$/.test(value) && Number(value) > 0, {
    message: "Puan değeri pozitif bir sayı olmalı (ör. 1 ya da 0,5).",
  });

export const AdminBankInput = z.object({ name: Name(80) }).strict();
export type AdminBankInput = z.infer<typeof AdminBankInput>;

const ProgramFields = {
  slug: Slug,
  name: Name(60),
  pointName: Name(40),
  pointValueTL: PointValueTL,
  /** true: puan değeri banka kaynağından doğrulandı. */
  pointValueVerified: z.boolean(),
};
export const AdminProgramCreateInput = z
  .object({
    bankId: z.string().min(1),
    ...ProgramFields,
    pointValueVerified: ProgramFields.pointValueVerified.default(false),
  })
  .strict();
export type AdminProgramCreateInput = z.infer<typeof AdminProgramCreateInput>;
export const AdminProgramUpdateInput = z.object(ProgramFields).partial().strict();
export type AdminProgramUpdateInput = z.infer<typeof AdminProgramUpdateInput>;

const CardFields = {
  name: Name(80),
  type: CardType,
  /** Yıllık ücret (kuruş); null = bilinmiyor / yok. */
  annualFee: Kurus.max(10_000_000).nullable(),
  baseRateBps: EarnRateBps,
  /** true: temel oran ve kategori oranları banka kaynağından doğrulandı. */
  ratesVerified: z.boolean(),
};
export const AdminCardCreateInput = z
  .object({
    programId: z.string().min(1),
    ...CardFields,
    annualFee: CardFields.annualFee.default(null),
    baseRateBps: CardFields.baseRateBps.default(0),
    ratesVerified: CardFields.ratesVerified.default(false),
  })
  .strict();
export type AdminCardCreateInput = z.infer<typeof AdminCardCreateInput>;
const CategoryRates = z
  .array(z.object({ categoryId: z.string().min(1), rateBps: EarnRateBps }).strict())
  .max(50)
  .refine(
    (rates) => new Set(rates.map((r) => r.categoryId)).size === rates.length,
    "Aynı kategori iki kez girilmiş.",
  );

/**
 * Kart güncellemesi (kısmi). `rates` verilirse kategoriye özel oranların tamamı değiştirilir
 * (listede olmayanlar silinir). Oran değişip `ratesVerified` gönderilmezse doğrulama kalkar.
 */
export const AdminCardUpdateInput = z
  .object({ ...CardFields, rates: CategoryRates })
  .partial()
  .strict();
export type AdminCardUpdateInput = z.infer<typeof AdminCardUpdateInput>;
