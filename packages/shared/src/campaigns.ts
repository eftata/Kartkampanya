import { z } from "zod";

import { Bps, Kurus } from "./money";

export const JoinMethod = z.enum(["AUTO", "SMS", "APP", "WEB"]);
export type JoinMethod = z.infer<typeof JoinMethod>;
export const ThresholdType = z.enum(["SINGLE", "CUMULATIVE", "TXN_COUNT"]);
export type ThresholdType = z.infer<typeof ThresholdType>;
export const RewardType = z.enum(["POINTS", "CASHBACK", "DISCOUNT", "INSTALLMENT"]);
export type RewardType = z.infer<typeof RewardType>;
export const CampaignStatus = z.enum(["DRAFT", "APPROVED", "REJECTED", "EXPIRED"]);
export type CampaignStatus = z.infer<typeof CampaignStatus>;

/** Takvim günü "YYYY-AA-GG" (saat dilimi yok; veritabanında UTC gece yarısı). */
export const DateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tarihi YYYY-AA-GG biçiminde yaz.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, "Geçersiz tarih.");

const MAX_KURUS = 100_000_000_00; // 100 milyon TL: üstü yazım hatasıdır
const Money = Kurus.max(MAX_KURUS, "Tutar çok büyük; yazım hatası olabilir.");
const Ids = (max: number) =>
  z
    .array(z.string().min(1))
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, "Aynı kayıt iki kez seçilmiş.");

/**
 * Kampanya kuralı (`CampaignRule`). Alanlar arası kurallar veri hattındaki pydantic doğrulamasıyla
 * aynıdır (services/engine/engine/pipeline/extract.py): SINGLE/CUMULATIVE → eşik tutarı,
 * TXN_COUNT → işlem adedi; taksit dışındaki ödüllerde tutar ya da oran zorunlu.
 */
export const CampaignRuleInput = z
  .object({
    categoryIds: Ids(50),
    merchantIds: Ids(100),
    thresholdType: ThresholdType,
    thresholdKurus: Money.nullable(),
    txnCount: z.number().int().min(1, "İşlem adedi en az 1 olmalı.").max(1000).nullable(),
    tierRepeat: z.boolean(),
    rewardType: RewardType,
    rewardKurus: Money.nullable(),
    rewardBps: Bps.max(10_000, "Ödül oranı %100'den yüksek olamaz.").nullable(),
    capKurus: Money.nullable(),
    exclusions: z.array(z.string().trim().min(1).max(40)).max(20),
  })
  .strict()
  .superRefine((rule, ctx) => {
    if (rule.thresholdType === "TXN_COUNT") {
      if (rule.txnCount === null) {
        ctx.addIssue({ code: "custom", path: ["txnCount"], message: "İşlem adedini yaz." });
      }
    } else if (rule.thresholdKurus === null) {
      ctx.addIssue({ code: "custom", path: ["thresholdKurus"], message: "Eşik tutarını yaz." });
    }
    if (rule.rewardType !== "INSTALLMENT" && rule.rewardKurus === null && rule.rewardBps === null) {
      ctx.addIssue({
        code: "custom",
        path: ["rewardKurus"],
        message: "Ödül tutarını ya da oranını yaz.",
      });
    }
  });
export type CampaignRuleInput = z.infer<typeof CampaignRuleInput>;

/** Admin'in düzenlediği kampanya: onay kuyruğundaki formun tamamı. */
export const AdminCampaignInput = z
  .object({
    title: z.string().trim().min(3, "Başlık en az 3 karakter olmalı.").max(200),
    summary: z
      .array(z.string().trim().min(1).max(200, "Özet maddesi en fazla 200 karakter olabilir."))
      .min(1, "En az bir özet maddesi yaz.")
      .max(3, "En fazla 3 özet maddesi olabilir."),
    startsAt: DateOnly,
    endsAt: DateOnly,
    joinMethod: JoinMethod,
    joinDeadline: DateOnly.nullable(),
    /** Kart kapsamı; boş = programdaki tüm kartlar. */
    cardIds: Ids(50),
    rules: z
      .array(CampaignRuleInput)
      .min(1, "En az bir kural olmalı.")
      .max(20, "En fazla 20 kural olabilir."),
  })
  .strict()
  .superRefine((campaign, ctx) => {
    if (campaign.endsAt < campaign.startsAt) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "Bitiş tarihi başlangıçtan önce olamaz.",
      });
    }
  });
export type AdminCampaignInput = z.infer<typeof AdminCampaignInput>;

/**
 * `PUT /api/admin/campaigns/{id}`: kaydet (durum değişmez), kaydet ve onayla, reddet.
 * Her işlem `AdminAuditLog`'a yazılır.
 */
export const AdminCampaignReview = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), campaign: AdminCampaignInput }).strict(),
  z.object({ action: z.literal("approve"), campaign: AdminCampaignInput }).strict(),
  z
    .object({
      action: z.literal("reject"),
      reason: z.string().trim().max(500, "Gerekçe en fazla 500 karakter olabilir.").optional(),
    })
    .strict(),
]);
export type AdminCampaignReview = z.infer<typeof AdminCampaignReview>;

// ---------- Kişisel kampanya listesi (Sprint 3) ----------

export const CampaignSort = z.enum(["ends", "gain"]);
export type CampaignSort = z.infer<typeof CampaignSort>;

/** `GET /api/me/campaigns?card=&category=&type=&sort=` (boş parametre = filtre yok). */
export const MyCampaignsQuery = z
  .object({
    /** Kullanıcının kartı (`UserCard.id`). */
    card: z.string().min(1).optional(),
    /** Ana kategori (`Category.id`). */
    category: z.string().min(1).optional(),
    type: RewardType.optional(),
    /** `ends`: bitişi yakın önce (varsayılan) · `gain`: tahmini kazancı yüksek önce. */
    sort: CampaignSort.default("ends"),
  })
  .strict();
export type MyCampaignsQuery = z.infer<typeof MyCampaignsQuery>;

export const MyCampaignDto = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.array(z.string()),
  sourceUrl: z.string(),
  bankName: z.string(),
  programName: z.string(),
  startsAt: DateOnly,
  endsAt: DateOnly,
  joinMethod: JoinMethod,
  joinDeadline: DateOnly.nullable(),
  /** Kampanyanın geçerli olduğu kullanıcı kartları. */
  cards: z.array(z.object({ id: z.string(), name: z.string() })),
  /** Kampanyanın dokunduğu, kullanıcının harcama profilindeki ana kategoriler. */
  categories: z.array(z.object({ id: z.string(), name: z.string() })),
  rewardTypes: z.array(RewardType),
  /**
   * Kaba tahmin (kuruş): kampanyanın kalan süresinde, profildeki aylık harcamayla tek başına
   * kazanılabilecek en yüksek ödül. Harcama kampanyalar arasında bölüştürülmez; bunu plan yapar.
   */
  estimateKurus: Kurus,
  /** Etiketler: katılım gerekiyor (AUTO değil), son 7 gün, henüz başlamadı. */
  joinRequired: z.boolean(),
  endingSoon: z.boolean(),
  upcoming: z.boolean(),
});
export type MyCampaignDto = z.infer<typeof MyCampaignDto>;

export const MyCampaignsResponse = z.object({ campaigns: z.array(MyCampaignDto) });
export type MyCampaignsResponse = z.infer<typeof MyCampaignsResponse>;
