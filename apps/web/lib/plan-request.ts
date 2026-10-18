/**
 * Kullanıcı verisi → `PlanRequest` (saf, veritabanısız; ADR 0016). Veri okuma `lib/plan.ts`'de.
 *
 * - Bütçe: harcama profili, ana kategoriye göre.
 * - Kartlar: kullanıcının kartları (`UserCard.id`), limit ve oranlar (kategori oranı ana kategoriye).
 * - Kampanyalar: her kural bir `PlanCampaign` (id = kural id'si); birden çok kurallı kampanyanın
 *   kuralları aynı grupta (alternatif kademe). Taksit ödülleri plana girmez (para değeri yok).
 * - Ay penceresi: kampanya ayın yalnızca bir kısmında geçerliyse, aylık harcamanın o pencereye düşen
 *   payı kadar eşik büyütülür, oransal ödül küçültülür (`threshold × ay günü / pencere günü`).
 * - Marka kuralı yalnızca kullanıcı o markayı harcama profilinde seçtiyse kategorisine bağlanır.
 * - Bu ay harcama girildiyse (Faz 2, ADR 0027) plan ayın kalanı için kurulur: bütçe profilden
 *   harcananı düşer, kart limiti harcananı düşer, pencere bugünden başlar; kazanılmış kural plandan
 *   çıkar, tekrarsız kuralın eşiği kalan tutar/adede iner, üst limitten kazanılan düşer.
 */
import { createHash } from "node:crypto";

import type { PlanRequestInput, RewardType, ThresholdType } from "@kartplan/shared";

import { daysBetween } from "@/lib/campaign-match";
import type { RuleProgress } from "@/lib/campaign-progress";

export type PlanCardInput = {
  id: string; // UserCard.id
  programId: string;
  cardProductId: string;
  limitKurus: number | null;
  baseRateBps: number;
  /** Kategori (herhangi bir seviye) → bps. */
  earnRates: { categoryId: string; rateBps: number }[];
};

export type PlanRuleInput = {
  id: string;
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

export type PlanCampaignInput = {
  id: string;
  programId: string;
  cardProductIds: string[]; // boş = programdaki tüm kartlar
  startsAt: string;
  endsAt: string;
  joinRequired: boolean;
  joinDeadline: string | null;
  joined: boolean;
  rules: PlanRuleInput[];
};

export type PlanSource = {
  month: string; // "2026-11"
  today: string;
  spend: { categoryId: string; monthlyKurus: number; merchantIds: string[] }[];
  cards: PlanCardInput[];
  campaigns: PlanCampaignInput[];
  /** Kategori → ana kategori; marka → kategori. */
  rootOf: Map<string, string>;
  merchantCategory: Map<string, string>;
  maxCards?: number;
  /** Bu ay girilen harcamalar varsa: kalan bütçeyle yeniden planlama. */
  spent?: PlanSpent;
};

export type PlanSpent = {
  /** Ana kategori → bu ay harcanan (kuruş). */
  byCategory: Map<string, number>;
  /** UserCard.id → bu ay harcanan (kuruş). */
  byCard: Map<string, number>;
  /** Kural id'si → ilerleme (kampanya penceresindeki harcamalardan). */
  progress: Map<string, RuleProgress>;
};

export function monthBounds(month: string): { first: string; last: string; days: number } {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  const days = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(days).padStart(2, "0")}`, days };
}

const monthFormat = new Intl.DateTimeFormat("tr-TR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-11" → "Kasım 2026". */
export function monthLabel(month: string): string {
  return monthFormat.format(new Date(`${month}-01T00:00:00Z`));
}

const DEFAULT_MAX_CARDS = 3;

export function buildPlanRequest(source: PlanSource): PlanRequestInput {
  const root = (id: string) => source.rootOf.get(id) ?? id;
  const spent = source.spent;
  const budget = new Map<string, number>();
  const preferred = new Map<string, Set<string>>();
  for (const item of source.spend) {
    const category = root(item.categoryId);
    budget.set(category, (budget.get(category) ?? 0) + item.monthlyKurus);
    const merchants = preferred.get(category) ?? new Set<string>();
    item.merchantIds.forEach((id) => merchants.add(id));
    preferred.set(category, merchants);
  }

  if (spent) {
    for (const [category, amount] of budget) {
      budget.set(category, Math.max(0, amount - (spent.byCategory.get(category) ?? 0)));
    }
  }

  const cards = source.cards.map((card) => {
    const rates: Record<string, number> = { "*": card.baseRateBps };
    for (const rate of card.earnRates) {
      const category = root(rate.categoryId);
      rates[category] = Math.max(rates[category] ?? 0, rate.rateBps);
    }
    const limit =
      spent && card.limitKurus !== null
        ? Math.max(0, card.limitKurus - (spent.byCard.get(card.id) ?? 0))
        : card.limitKurus;
    return { id: card.id, limit, baseRateBps: rates };
  });

  const bounds = monthBounds(source.month);
  const { last } = bounds;
  // Kalan bütçe modunda pencere ve ay bugünden başlar (bütçe ayın kalanına yayılır).
  const first = spent && source.today > bounds.first ? source.today : bounds.first;
  const days = daysBetween(first, last);
  const campaigns: PlanRequestInput["campaigns"] = [];
  for (const campaign of source.campaigns) {
    const from = campaign.startsAt > first ? campaign.startsAt : first;
    const to = campaign.endsAt < last ? campaign.endsAt : last;
    if (to < from || campaign.endsAt < source.today) continue;
    const windowDays = daysBetween(from, to);
    const scope = new Set(campaign.cardProductIds);
    const cardIds = source.cards
      .filter(
        (card) =>
          card.programId === campaign.programId &&
          (scope.size === 0 || scope.has(card.cardProductId)),
      )
      .map((card) => card.id);
    if (cardIds.length === 0) continue;
    const eligible = !(
      campaign.joinRequired &&
      campaign.joinDeadline !== null &&
      campaign.joinDeadline < source.today &&
      !campaign.joined
    );
    const group = campaign.rules.length > 1 ? campaign.id : null;

    for (const rule of campaign.rules) {
      if (rule.rewardType === "INSTALLMENT") continue;
      const progress = spent?.progress.get(rule.id);
      if (progress?.complete) continue; // ödülü alındı ya da üst limit doldu
      const adjusted = progress ? remainingRule(rule, progress) : rule;
      const everything = rule.categoryIds.length === 0 && rule.merchantIds.length === 0;
      const categories = new Set<string>();
      for (const id of rule.categoryIds) categories.add(root(id));
      for (const id of rule.merchantIds) {
        const category = root(source.merchantCategory.get(id) ?? "");
        if (preferred.get(category)?.has(id)) categories.add(category);
      }
      const inBudget = [...categories].filter((category) => budget.has(category));
      if (!everything && inBudget.length === 0) continue; // boş liste "tüm harcamalar" demek olurdu

      const scale = (value: number) => Math.ceil((value * days) / windowDays);
      campaigns.push({
        id: rule.id,
        cards: cardIds,
        categories: everything ? [] : inBudget.sort(),
        thresholdType: rule.thresholdType,
        threshold: scale(adjusted.thresholdKurus ?? 0),
        txnCount: adjusted.txnCount,
        tierRepeat: rule.tierRepeat,
        reward: rule.rewardKurus ?? 0,
        rewardBps:
          rule.rewardBps === null ? null : Math.floor((rule.rewardBps * windowDays) / days),
        cap: adjusted.capKurus,
        eligible,
        group,
      });
    }
  }

  return {
    month: source.month,
    budget: [...budget].map(([category, amount]) => ({ category, amount })),
    cards,
    campaigns,
    options: {
      maxCards: Math.min(source.maxCards ?? DEFAULT_MAX_CARDS, Math.max(cards.length, 1)),
      timeLimitMs: 2000,
    },
  };
}

/**
 * Kısmen ilerlemiş kuralın ayın kalanı için hali: tekrarsız kuralda eşik kalan tutara/adede iner;
 * tekrarlanan kuralda eşik aynı kalır (kısmi kademe yok sayılır, temkinli); üst limitten kazanılan
 * düşer.
 */
function remainingRule(rule: PlanRuleInput, progress: RuleProgress): PlanRuleInput {
  const capKurus =
    rule.capKurus === null ? null : Math.max(0, rule.capKurus - progress.earnedKurus);
  if (rule.tierRepeat || progress.toNext === null) return { ...rule, capKurus };
  if (progress.kind === "amount") return { ...rule, thresholdKurus: progress.toNext, capKurus };
  if (progress.kind === "count")
    return { ...rule, txnCount: Math.max(1, progress.toNext), capKurus };
  return { ...rule, capKurus };
}

/** Nesne anahtarları sıralı JSON: aynı içerik her zaman aynı metni verir. Dizi sırası korunur. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Plan isteğinin özeti (ADR 0017). Aynıysa kayıtlı plan geçerlidir; kart, limit, profil, kampanya
 * ya da katılım değişince özet değişir ve plan yeniden hesaplanır.
 */
export function planInputHash(request: PlanRequestInput): string {
  return createHash("sha256").update(canonical(request)).digest("hex");
}
