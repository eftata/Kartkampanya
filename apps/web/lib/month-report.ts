/**
 * Ay sonu raporu (saf; ADR 0029): bir ayda biten kampanyalardan ne kazanıldığı, ne kaçırıldığı ve
 * kartların temel kazancı. Kampanya sonucu bitişinin olduğu aya yazılır (iki aya yayılan kampanya
 * iki kez sayılmaz); kazanç tüm kampanya penceresindeki harcamalardan hesaplanır.
 */
import { ruleProgress } from "@/lib/campaign-progress";
import type { ProgressCampaign, ProgressTransaction, RuleProgress } from "@/lib/campaign-progress";
import type { MatchRule } from "@/lib/campaign-match";
import { monthBounds } from "@/lib/plan-request";

export type ReportCampaign = ProgressCampaign & {
  id: string;
  title: string;
  joinRequired: boolean;
  joined: boolean;
  rules: (MatchRule & { id: string })[];
};

export type ReportTransaction = ProgressTransaction & { userCardId: string };

export type ReportCard = {
  id: string;
  name: string;
  baseRateBps: number;
  /** Ana kategori → bps. */
  rates: Map<string, number>;
};

export type EarnedCampaign = { id: string; title: string; earnedKurus: number; tiers: number };

export type MissedCampaign = {
  id: string;
  title: string;
  /** not_joined: harcama tuttu ama katılmadın · threshold: eşiğe ulaşılmadı. */
  reason: "not_joined" | "threshold";
  /** Kaçırılan ödül (tahmini). */
  rewardKurus: number;
  /** threshold: eşik için eksik kalan (amount: kuruş, count: adet, single: gereken tek harcama). */
  missing: number | null;
  kind: RuleProgress["kind"];
};

export type MonthReport = {
  month: string;
  /** Ay bitti mi (bitmediyse rapor "şimdiye kadar"). */
  closed: boolean;
  spentKurus: number;
  spentByCategory: { categoryId: string; spentKurus: number }[];
  /** Kartların temel kazancı (kampanya dışı puan/iade). */
  baseEarnedKurus: number;
  campaignEarnedKurus: number;
  earned: EarnedCampaign[];
  missed: MissedCampaign[];
  /** Ay içinde bitecek ama henüz bitmemiş kampanya sayısı (rapora girmedi). */
  ongoing: number;
};

/** Kartın kategori oranıyla temel kazanç (kuruş, aşağı yuvarlı). */
function baseEarned(transactions: ReportTransaction[], cards: Map<string, ReportCard>): number {
  let total = 0;
  for (const txn of transactions) {
    const card = cards.get(txn.userCardId);
    if (!card) continue;
    const bps = card.rates.get(txn.categoryId) ?? card.baseRateBps;
    total += Math.floor((txn.amountKurus * bps) / 10_000);
  }
  return total;
}

/** Bir sonraki kademenin ödülü (tahmini): sabit ödül, oransal ise eşik × oran. */
function tierReward(rule: MatchRule, progress: RuleProgress): number {
  const fixed = rule.rewardKurus ?? 0;
  const rate =
    rule.rewardBps && progress.kind === "amount"
      ? Math.floor((progress.target * rule.rewardBps) / 10_000)
      : 0;
  const reward = fixed + rate;
  return rule.capKurus === null ? reward : Math.min(reward, rule.capKurus);
}

export function computeMonthReport({
  month,
  today,
  campaigns,
  transactions,
  cards,
  rootOf = (id) => id,
}: {
  month: string;
  today: string;
  campaigns: ReportCampaign[];
  /** Ayın ve raporlanan kampanyaların pencerelerindeki harcamalar. */
  transactions: ReportTransaction[];
  cards: ReportCard[];
  rootOf?: (categoryId: string) => string;
}): MonthReport {
  const { first, last } = monthBounds(month);
  const monthTxns = transactions.filter((txn) => txn.date >= first && txn.date <= last);
  const byCategory = new Map<string, number>();
  for (const txn of monthTxns) {
    byCategory.set(txn.categoryId, (byCategory.get(txn.categoryId) ?? 0) + txn.amountKurus);
  }

  const earned: EarnedCampaign[] = [];
  const missed: MissedCampaign[] = [];
  let ongoing = 0;
  for (const campaign of campaigns) {
    if (campaign.endsAt < first || campaign.endsAt > last) continue;
    if (campaign.endsAt >= today) {
      ongoing += 1; // sonucu henüz belli değil
      continue;
    }
    const results = campaign.rules
      .filter((rule) => rule.rewardType !== "INSTALLMENT")
      .map((rule) => ({ rule, progress: ruleProgress(rule, campaign, transactions, rootOf) }));
    if (results.length === 0) continue;
    // Çok kurallı kampanyada kurallar alternatif kademelerdir: en yüksek kazanç sayılır.
    const best = results.reduce((a, b) =>
      b.progress.earnedKurus > a.progress.earnedKurus ? b : a,
    );
    const spentInScope = results.some(({ progress }) => progress.matched > 0);
    if (best.progress.earnedKurus > 0 && campaign.joinRequired && !campaign.joined) {
      missed.push({
        id: campaign.id,
        title: campaign.title,
        reason: "not_joined",
        rewardKurus: best.progress.earnedKurus,
        missing: null,
        kind: best.progress.kind,
      });
    } else if (best.progress.earnedKurus > 0) {
      earned.push({
        id: campaign.id,
        title: campaign.title,
        earnedKurus: best.progress.earnedKurus,
        tiers: best.progress.tiers,
      });
    } else if (spentInScope) {
      // Eşiğe en yakın kural.
      const closest = results
        .filter(({ progress }) => progress.toNext !== null)
        .sort((a, b) => (a.progress.toNext ?? 0) - (b.progress.toNext ?? 0))[0];
      if (closest) {
        missed.push({
          id: campaign.id,
          title: campaign.title,
          reason: "threshold",
          rewardKurus: tierReward(closest.rule, closest.progress),
          missing: closest.progress.toNext,
          kind: closest.progress.kind,
        });
      }
    }
  }

  const campaignEarnedKurus = earned.reduce((sum, item) => sum + item.earnedKurus, 0);
  return {
    month,
    closed: last < today,
    spentKurus: monthTxns.reduce((sum, txn) => sum + txn.amountKurus, 0),
    spentByCategory: [...byCategory]
      .map(([categoryId, spentKurus]) => ({ categoryId, spentKurus }))
      .sort((a, b) => b.spentKurus - a.spentKurus),
    baseEarnedKurus: baseEarned(monthTxns, new Map(cards.map((card) => [card.id, card]))),
    campaignEarnedKurus,
    earned: earned.sort((a, b) => b.earnedKurus - a.earnedKurus),
    missed: missed.sort((a, b) => b.rewardKurus - a.rewardKurus),
    ongoing,
  };
}

/** Önceki ay ("2026-11" → "2026-10"). */
export function previousMonth(month: string): string {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(year, mon - 2, 1));
  return date.toISOString().slice(0, 7);
}
