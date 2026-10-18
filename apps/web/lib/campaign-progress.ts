/**
 * Kampanya eşik ilerlemesi (saf; ADR 0027): kullanıcının girdiği harcamalardan her kuralın ne kadar
 * dolduğu, kaç kademe kazanıldığı ve bir sonraki kademeye ne kaldığı.
 *
 * Eşleşme: harcama kampanya tarihleri içinde, kampanyanın programındaki (ve kart kapsamındaki)
 * kartla yapılmış olmalı. Kural markalıysa marka eşleşmeli; kategorili ise kategorinin ana
 * kategorisi harcamanınkiyle aynı olmalı (harcama ana kategoriyle girildiği için alt kategori
 * kurallarında yaklaşık). Kural kapsamsızsa her harcama sayılır. Tahminler kuruş cinsinden kesin
 * hesaplanır ama bankanın kendi kayıtlarının yerini tutmaz.
 */
import type { MatchRule } from "@/lib/campaign-match";

export type ProgressTransaction = {
  programId: string;
  cardProductId: string;
  /** Ana kategori. */
  categoryId: string;
  merchantId: string | null;
  amountKurus: number;
  date: string; // YYYY-AA-GG
};

export type ProgressCampaign = {
  programId: string;
  cardProductIds: string[]; // boş = programdaki tüm kartlar
  startsAt: string;
  endsAt: string;
};

export type RuleProgress = {
  kind: "amount" | "single" | "count";
  /** amount: toplam harcama · single: en büyük tek harcama · count: işlem sayısı. */
  current: number;
  /** Bir kademenin hedefi (tutar ya da adet). */
  target: number;
  /** Kazanılan kademe (tekrarlanmayan kuralda 0 ya da 1). */
  tiers: number;
  /** Şimdiye kadar kazanılan tahmini ödül (üst limitle sınırlı; taksitte 0). */
  earnedKurus: number;
  /** Bir sonraki kademeye kalan (amount: kuruş, count: adet, single: gereken tek harcama). */
  toNext: number | null;
  /** Bu kuraldan daha fazla ödül alınamaz (tekrarsız kural tamam ya da üst limit doldu). */
  complete: boolean;
  /** Kurala sayılan harcama sayısı. */
  matched: number;
};

export function matchesRule(
  rule: Pick<MatchRule, "categoryIds" | "merchantIds">,
  campaign: ProgressCampaign,
  txn: ProgressTransaction,
  rootOf: (categoryId: string) => string,
): boolean {
  if (txn.date < campaign.startsAt || txn.date > campaign.endsAt) return false;
  if (txn.programId !== campaign.programId) return false;
  if (campaign.cardProductIds.length > 0 && !campaign.cardProductIds.includes(txn.cardProductId)) {
    return false;
  }
  if (rule.categoryIds.length === 0 && rule.merchantIds.length === 0) return true;
  if (txn.merchantId && rule.merchantIds.includes(txn.merchantId)) return true;
  return rule.categoryIds.some((id) => rootOf(id) === txn.categoryId);
}

export function ruleProgress(
  rule: MatchRule,
  campaign: ProgressCampaign,
  transactions: ProgressTransaction[],
  rootOf: (categoryId: string) => string = (id) => id,
): RuleProgress {
  const matched = transactions.filter((txn) => matchesRule(rule, campaign, txn, rootOf));
  const threshold = rule.thresholdKurus ?? 0;
  const reward = rule.rewardKurus ?? 0;
  const bps = rule.rewardBps ?? 0;
  const capTiers =
    rule.capKurus !== null && reward > 0 ? Math.floor(rule.capKurus / reward) : Infinity;

  let kind: RuleProgress["kind"];
  let current: number;
  let target: number;
  let tiers: number;
  let qualifyingKurus: number; // oransal ödülün uygulandığı harcama

  if (rule.thresholdType === "TXN_COUNT") {
    kind = "count";
    const counted = matched.filter((txn) => txn.amountKurus >= threshold);
    current = counted.length;
    target = Math.max(1, rule.txnCount ?? 1);
    tiers = rule.tierRepeat ? Math.floor(current / target) : current >= target ? 1 : 0;
    qualifyingKurus = tiers > 0 ? counted.reduce((sum, txn) => sum + txn.amountKurus, 0) : 0;
  } else if (rule.thresholdType === "SINGLE") {
    kind = "single";
    const qualifying = matched.filter((txn) => txn.amountKurus >= threshold && txn.amountKurus > 0);
    current = matched.reduce((max, txn) => Math.max(max, txn.amountKurus), 0);
    target = threshold;
    tiers = rule.tierRepeat ? qualifying.length : Math.min(1, qualifying.length);
    qualifyingKurus = qualifying.reduce((sum, txn) => sum + txn.amountKurus, 0);
  } else {
    kind = "amount";
    current = matched.reduce((sum, txn) => sum + txn.amountKurus, 0);
    target = threshold;
    if (threshold === 0) tiers = current > 0 ? 1 : 0;
    else tiers = rule.tierRepeat ? Math.floor(current / threshold) : current >= threshold ? 1 : 0;
    qualifyingKurus = tiers > 0 ? current : 0;
  }
  tiers = Math.min(tiers, capTiers);

  let earnedKurus =
    rule.rewardType === "INSTALLMENT"
      ? 0
      : tiers * reward + Math.floor((qualifyingKurus * bps) / 10_000);
  if (rule.capKurus !== null) earnedKurus = Math.min(earnedKurus, rule.capKurus);

  const capReached =
    rule.rewardType !== "INSTALLMENT" && rule.capKurus !== null && earnedKurus >= rule.capKurus;
  const complete = capReached || (!rule.tierRepeat && tiers >= 1);
  let toNext: number | null = null;
  if (!complete) {
    if (kind === "single") toNext = target;
    else if (kind === "count" || target > 0) toNext = target * (tiers + 1) - current;
  }
  return { kind, current, target, tiers, earnedKurus, toNext, complete, matched: matched.length };
}
