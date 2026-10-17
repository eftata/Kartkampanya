/**
 * Eşleştirme çekirdeği (saf, veritabanısız): bir kampanya kullanıcının kartlarına ve harcama
 * alanlarına uyuyor mu, uyuyorsa hangi kartlar/kategoriler ve kabaca ne kazandırır.
 * Veri okuma `lib/campaigns.ts`'de; burada yalnızca kurallar (ADR 0014).
 */
import type { RewardType, ThresholdType } from "@kartplan/shared";

export type MatchRule = {
  categoryIds: string[];
  merchantIds: string[];
  thresholdType: ThresholdType;
  thresholdKurus: number | null;
  txnCount: number | null;
  tierRepeat: boolean;
  rewardType: RewardType;
  rewardKurus: number | null;
  rewardBps: number | null;
  capKurus: number | null;
};

export type MatchCampaign = {
  programId: string;
  /** Kart kapsamı (`CardProduct.id`); boş = programdaki tüm kartlar. */
  cardProductIds: string[];
  startsAt: string; // YYYY-AA-GG
  endsAt: string;
  joinDeadline: string | null;
  rules: MatchRule[];
};

export type MatchUser = {
  cards: { id: string; cardProductId: string; programId: string }[];
  /** Harcama profili: ana kategori → aylık tutar (kuruş). */
  spend: Map<string, number>;
};

export type Taxonomy = {
  /** Her kategori → ana (en üst) kategorisi. */
  rootOf: Map<string, string>;
  /** Her marka → kategorisinin ana kategorisi. */
  merchantRoot: Map<string, string>;
};

export type Match = {
  /** Uyan kullanıcı kartları (`UserCard.id`). */
  cardIds: string[];
  /** Uyan ana kategoriler (kullanıcının profilindekiler). */
  categoryIds: string[];
  rewardTypes: RewardType[];
  estimateKurus: number;
};

/** "YYYY-AA-GG" iki gün arası (dahil) gün sayısı. */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.floor(ms / 86_400_000) + 1;
}

/** Kuralın dokunduğu, kullanıcının profilindeki ana kategoriler. Boş kural = tüm harcamalar. */
function ruleRoots(rule: MatchRule, user: MatchUser, taxonomy: Taxonomy): string[] {
  if (rule.categoryIds.length === 0 && rule.merchantIds.length === 0) return [...user.spend.keys()];
  const roots = new Set<string>();
  for (const id of rule.categoryIds) roots.add(taxonomy.rootOf.get(id) ?? id);
  for (const id of rule.merchantIds) {
    const root = taxonomy.merchantRoot.get(id);
    if (root) roots.add(root);
  }
  return [...roots].filter((root) => user.spend.has(root));
}

/**
 * Tek kuralın kaba kazanç tahmini. `spend` kampanyanın kalan süresindeki harcama, `monthly`
 * aylık harcamadır (tek seferlik eşik için: o tutarda tek alışveriş yapılabilir varsayımı).
 * İşlem adedi bilinmediği için TXN_COUNT eşiği harcama varsa tutmuş sayılır. Taksit ödülü 0.
 */
export function estimateRule(rule: MatchRule, spend: number, monthly: number): number {
  if (rule.rewardType === "INSTALLMENT" || spend <= 0) return 0;
  const threshold = rule.thresholdKurus ?? 0;
  const reached =
    rule.thresholdType === "CUMULATIVE"
      ? spend >= threshold
      : rule.thresholdType === "SINGLE"
        ? monthly >= threshold
        : true;
  if (!reached) return 0;
  let reward = 0;
  if (rule.rewardKurus !== null) {
    const times =
      rule.tierRepeat && rule.thresholdType === "CUMULATIVE" && threshold > 0
        ? Math.floor(spend / threshold)
        : 1;
    reward += times * rule.rewardKurus;
  }
  if (rule.rewardBps !== null) reward += Math.floor((spend * rule.rewardBps) / 10_000);
  return rule.capKurus === null ? reward : Math.min(reward, rule.capKurus);
}

/**
 * Kampanya kullanıcıya uyuyor mu? Uymuyorsa null.
 * - Süresi bitmiş ya da son katılım tarihi geçmiş kampanya uymaz.
 * - Kart: kampanyanın programında bir kartı olmalı; kapsam doluysa o kartlardan biri.
 * - Alan: en az bir kuralı kullanıcının harcama profilindeki bir ana kategoriye dokunmalı.
 * Tahmin: uyan kuralların en yükseği (kademeli kampanyalarda kurallar toplanmaz).
 */
export function matchCampaign(
  campaign: MatchCampaign,
  user: MatchUser,
  taxonomy: Taxonomy,
  today: string,
): Match | null {
  if (campaign.endsAt < today) return null;
  if (campaign.joinDeadline !== null && campaign.joinDeadline < today) return null;

  const scope = new Set(campaign.cardProductIds);
  const cardIds = user.cards
    .filter(
      (card) =>
        card.programId === campaign.programId &&
        (scope.size === 0 || scope.has(card.cardProductId)),
    )
    .map((card) => card.id);
  if (cardIds.length === 0) return null;

  const from = campaign.startsAt > today ? campaign.startsAt : today;
  const days = daysBetween(from, campaign.endsAt);
  const categoryIds = new Set<string>();
  const rewardTypes = new Set<RewardType>();
  let estimateKurus = 0;
  for (const rule of campaign.rules) {
    const roots = ruleRoots(rule, user, taxonomy);
    if (roots.length === 0) continue;
    roots.forEach((root) => categoryIds.add(root));
    rewardTypes.add(rule.rewardType);
    const monthly = roots.reduce((sum, root) => sum + (user.spend.get(root) ?? 0), 0);
    const spend = Math.floor((monthly * days) / 30);
    estimateKurus = Math.max(estimateKurus, estimateRule(rule, spend, monthly));
  }
  if (categoryIds.size === 0) return null;
  return {
    cardIds,
    categoryIds: [...categoryIds],
    rewardTypes: [...rewardTypes],
    estimateKurus,
  };
}

/** Türkiye takvim günü (UTC+3, yaz saati yok): kampanya tarihleri bu takvimdedir. */
export function turkeyToday(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
}
