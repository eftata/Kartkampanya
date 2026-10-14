import { z } from "zod";

import { Kurus } from "./money";

/** Kategori başına aylık harcama üst sınırı: 1.000.000 TL (kuruş). */
export const MAX_MONTHLY_KURUS = 100_000_000;
/** Kategori başına en fazla tercih edilen marka. */
export const MAX_PREFERRED_MERCHANTS = 10;

export const SpendProfileItemInput = z.object({
  categoryId: z.string().min(1),
  monthlyKurus: Kurus.min(100, "Her kategori için aylık tutar gir (en az 1 TL).").max(
    MAX_MONTHLY_KURUS,
    "Aylık tutar çok yüksek görünüyor.",
  ),
  merchantIds: z
    .array(z.string().min(1))
    .max(
      MAX_PREFERRED_MERCHANTS,
      `Kategori başına en fazla ${MAX_PREFERRED_MERCHANTS} marka seçebilirsin.`,
    )
    .refine((ids) => new Set(ids).size === ids.length, "Aynı marka iki kez seçilmiş.")
    .default([]),
});

/** Profilin tamamı: listede olmayan kategoriler profilden çıkarılır. */
export const SpendProfileInput = z.object({
  items: z
    .array(SpendProfileItemInput)
    .min(1, "En az bir harcama kategorisi seç.")
    .refine(
      (items) => new Set(items.map((i) => i.categoryId)).size === items.length,
      "Aynı kategori iki kez gönderilmiş.",
    ),
});
export type SpendProfileInput = z.infer<typeof SpendProfileInput>;

export const SpendProfileItemDto = z.object({
  categoryId: z.string(),
  categorySlug: z.string(),
  categoryName: z.string(),
  monthlyKurus: Kurus,
  merchantIds: z.array(z.string()),
});
export const SpendProfileDto = z.object({
  items: z.array(SpendProfileItemDto),
  totalKurus: Kurus,
});
export type SpendProfileDto = z.infer<typeof SpendProfileDto>;

export const SpendCategory = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  merchants: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type SpendCategory = z.infer<typeof SpendCategory>;
export const CatalogCategoriesResponse = z.object({ categories: z.array(SpendCategory) });
export type CatalogCategoriesResponse = z.infer<typeof CatalogCategoriesResponse>;
