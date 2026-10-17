import { z } from "zod";

import { ThresholdType } from "./campaigns";
import { Bps, Kurus } from "./money";

/**
 * Optimizasyon motoru sözleşmesi (ROADMAP → "Optimizasyon servisi"). Web `PlanRequest` gönderir,
 * motor `PlanResponse` döner. Tüm tutarlar kuruş, oranlar baz puan.
 *
 * Bu şemalar tek kaynaktır: `pnpm --filter @kartplan/shared gen:plan-schema` JSON Schema'yı
 * (`schema/plan-*.schema.json`) üretir, motor pydantic modellerini ondan üretir (ADR 0015).
 */

const Id = z.string().min(1).max(100);
const Amount = Kurus.max(10_000_000_000); // 100 milyon TL

export const PlanBudgetItem = z.object({ category: Id, amount: Amount }).strict().meta({
  id: "PlanBudgetItem",
  description: "Kategori başına aylık harcama (kuruş). Kategori, kampanyalardaki adla aynı olmalı.",
});

export const PlanCard = z
  .object({
    id: Id,
    /** Kartın bu ay kullanılabilir limiti (kuruş); null = sınırsız / bilinmiyor. */
    limit: Amount.nullable(),
    /** Temel kazanç oranı: kategori → bps; "*" diğer tüm kategoriler. */
    baseRateBps: z.record(z.string(), Bps.max(10_000)),
  })
  .strict()
  .meta({ id: "PlanCard" });

export const PlanCampaign = z
  .object({
    id: Id,
    /** Kampanyanın geçerli olduğu kartlar (`PlanCard.id`). */
    cards: z.array(Id).min(1),
    /** Geçerli kategoriler; boş = tüm harcamalar. */
    categories: z.array(Id),
    thresholdType: ThresholdType,
    /** Eşik (kuruş); işlem adedi eşiğinde kullanılmaz. 0 = eşiksiz. */
    threshold: Amount,
    /** İşlem adedi eşiği (TXN_COUNT); diğerlerinde null. */
    txnCount: z.number().int().min(1).nullable().default(null),
    /** Eşik tekrarlanır ("her 2.500 TL'ye"). */
    tierRepeat: z.boolean(),
    /** Eşik başına sabit ödül (kuruş). */
    reward: Amount,
    /** Oransal ödül (bps, eşiği geçen harcamanın tamamına); yoksa null. */
    rewardBps: Bps.max(10_000).nullable().default(null),
    /** Kampanya boyunca üst limit (kuruş); null = limitsiz. */
    cap: Amount.nullable(),
    /** false: katılım süresi geçmiş ve kullanıcı katılmamış — motor yok sayar. */
    eligible: z.boolean(),
    /**
     * Aynı gruptaki kurallardan yalnızca en yüksek ödüllüsü sayılır (bir kampanyanın alternatif
     * kademeleri: "1.000 TL'ye 50 TL, 2.000 TL'ye 120 TL"). null = bağımsız kural.
     */
    group: Id.nullable().default(null),
  })
  .strict()
  .meta({ id: "PlanCampaign" });

export const PlanOptions = z
  .object({
    maxCards: z.number().int().min(1).max(20).default(3),
    timeLimitMs: z.number().int().min(100).max(10_000).default(2000),
  })
  .strict()
  .meta({ id: "PlanOptions" });

export const PlanRequest = z
  .object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    budget: z.array(PlanBudgetItem).max(50),
    cards: z.array(PlanCard).min(1).max(20),
    campaigns: z.array(PlanCampaign).max(1000),
    /** Verilmezse varsayılan seçenekler (maxCards 3, timeLimitMs 2000). */
    options: PlanOptions.optional(),
  })
  .strict();
export type PlanRequest = z.infer<typeof PlanRequest>;
export type PlanRequestInput = z.input<typeof PlanRequest>;

export const PlanAllocation = z
  .object({
    category: Id,
    card: Id,
    amount: Kurus,
    /** Bu harcamanın katkı verdiği ve ödülü kazanılan kampanyalar. */
    campaigns: z.array(Id),
    /** Temel kazanç + kampanya ödüllerinden bu harcamaya düşen pay (kuruş). */
    expectedReward: Kurus,
  })
  .strict()
  .meta({ id: "PlanAllocation" });

export const PlanResponse = z
  .object({
    /** OPTIMAL: kanıtlanmış en iyi · FEASIBLE: süre doldu, bulunan en iyi · FALLBACK: açgözlü. */
    status: z.enum(["OPTIMAL", "FEASIBLE", "FALLBACK"]),
    allocations: z.array(PlanAllocation),
    campaignsHit: z.array(
      z
        .object({ id: Id, tiers: z.number().int().min(1), reward: Kurus })
        .strict()
        .meta({ id: "PlanCampaignHit" }),
    ),
    /** Eşiğine ulaşılmayan (ya da sonraki kademesi alınmayan) kampanyalar; gereksiz harcamaya
     * teşvik edilmez, yalnızca bilgi. */
    nearMisses: z.array(
      z
        .object({ id: Id, missingAmount: Kurus, extraReward: Kurus })
        .strict()
        .meta({ id: "PlanNearMiss" }),
    ),
    /** Kart limitleri yetmediği için hiçbir karta yazılamayan harcama. */
    unallocated: z.array(
      z.object({ category: Id, amount: Kurus }).strict().meta({ id: "PlanUnallocated" }),
    ),
    totalExpected: Kurus,
    baseline: z
      .object({
        strategy: z.literal("single_best_card"),
        card: Id.nullable(),
        total: Kurus,
      })
      .strict()
      .meta({ id: "PlanBaseline" }),
    solver: z
      .object({ engine: z.enum(["cp-sat", "greedy"]), ms: z.number().int().min(0) })
      .strict()
      .meta({ id: "PlanSolver" }),
  })
  .strict();
export type PlanResponse = z.infer<typeof PlanResponse>;

/**
 * Motorun pydantic modellerinin kaynağı olan JSON Schema'lar (ADR 0015). İstek "girdi" biçimiyle
 * (isteğe bağlı alanlar isteğe bağlı), yanıt "çıktı" biçimiyle üretilir.
 */
export function planJsonSchemas() {
  const options = { target: "draft-2020-12" } as const;
  return {
    "plan-request.schema.json": z.toJSONSchema(PlanRequest, { ...options, io: "input" }),
    "plan-response.schema.json": z.toJSONSchema(PlanResponse, { ...options, io: "output" }),
  };
}
