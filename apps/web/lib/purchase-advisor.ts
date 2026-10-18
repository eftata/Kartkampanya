/**
 * Tek alışveriş hesaplayıcısı (saf; ADR 0030): "4.000 TL telefon, hangi kartla?" Her kart için bu
 * alışverişin **marjinal** kazancı: kart temel kazancı + kampanyalarda alışverişten önceki ve sonraki
 * kazanç farkı (`ruleProgress`; bu ay ve kampanya penceresinde zaten girilmiş harcamalarla). Eşiği
 * zaten geçilmiş ya da üst limiti dolmuş kampanya kazanç göstermez; eşiği bu alışverişle geçilen
 * gösterir.
 */
import { ruleProgress } from "@/lib/campaign-progress";
import type { ProgressTransaction } from "@/lib/campaign-progress";
import type { ReportCampaign } from "@/lib/month-report";

export type Purchase = {
  amountKurus: number;
  /** Ana kategori. */
  categoryId: string;
  merchantId: string | null;
  date: string; // YYYY-AA-GG
};

export type AdvisorCard = {
  id: string;
  name: string;
  programId: string;
  cardProductId: string;
  baseRateBps: number;
  /** Ana kategori → bps. */
  rates: Map<string, number>;
  limitKurus: number | null;
  /** Bu ay bu kartla girilmiş harcama (limit uyarısı için). */
  spentThisMonthKurus: number;
};

export type AdvisorCampaign = ReportCampaign & { joinDeadline: string | null };

export type CampaignGain = { id: string; title: string; gainKurus: number };

export type CardAdvice = {
  cardId: string;
  name: string;
  /** Temel kazanç + katıldığın/katılım gerektirmeyen kampanyalardan ek kazanç. */
  totalKurus: number;
  baseKurus: number;
  campaigns: CampaignGain[];
  /** Katılırsan kazanacakların (katılım gerekli, henüz katılmadın, süresi geçmedi). */
  ifJoined: (CampaignGain & { joinDeadline: string | null })[];
  /** Ek taksit kampanyası bu alışverişe uyuyor (tutar değeri hesaplanmaz). */
  installments: { id: string; title: string }[];
  /** Kart limitinde bu ay kalan, alışverişe yetmiyor (limit girildiyse). */
  overLimit: boolean;
};

const earned = (
  campaign: AdvisorCampaign,
  transactions: ProgressTransaction[],
  rootOf: (id: string) => string,
) =>
  Math.max(
    0,
    ...campaign.rules
      .filter((rule) => rule.rewardType !== "INSTALLMENT")
      .map((rule) => ruleProgress(rule, campaign, transactions, rootOf).earnedKurus),
  );

export function advisePurchase({
  purchase,
  cards,
  campaigns,
  transactions,
  rootOf = (id) => id,
}: {
  purchase: Purchase;
  cards: AdvisorCard[];
  campaigns: AdvisorCampaign[];
  /** Kampanya pencerelerindeki mevcut harcamalar (tüm kartlar). */
  transactions: ProgressTransaction[];
  rootOf?: (categoryId: string) => string;
}): CardAdvice[] {
  const advice = cards.map((card): CardAdvice => {
    const hypothetical: ProgressTransaction = {
      programId: card.programId,
      cardProductId: card.cardProductId,
      categoryId: purchase.categoryId,
      merchantId: purchase.merchantId,
      amountKurus: purchase.amountKurus,
      date: purchase.date,
    };
    const after = [...transactions, hypothetical];
    const baseKurus = Math.floor(
      (purchase.amountKurus * (card.rates.get(purchase.categoryId) ?? card.baseRateBps)) / 10_000,
    );
    const gains: CampaignGain[] = [];
    const ifJoined: CardAdvice["ifJoined"] = [];
    const installments: CardAdvice["installments"] = [];
    for (const campaign of campaigns) {
      if (campaign.programId !== card.programId) continue;
      if (purchase.date < campaign.startsAt || purchase.date > campaign.endsAt) continue;
      const needsJoin = campaign.joinRequired && !campaign.joined;
      if (needsJoin && campaign.joinDeadline !== null && campaign.joinDeadline < purchase.date) {
        continue; // katılım süresi geçti
      }
      const installment = campaign.rules.some(
        (rule) =>
          rule.rewardType === "INSTALLMENT" &&
          ruleProgress(rule, campaign, after, rootOf).tiers >
            ruleProgress(rule, campaign, transactions, rootOf).tiers,
      );
      if (installment) installments.push({ id: campaign.id, title: campaign.title });
      const gainKurus = earned(campaign, after, rootOf) - earned(campaign, transactions, rootOf);
      if (gainKurus <= 0) continue;
      const item = { id: campaign.id, title: campaign.title, gainKurus };
      if (needsJoin) ifJoined.push({ ...item, joinDeadline: campaign.joinDeadline });
      else gains.push(item);
    }
    const remaining = card.limitKurus === null ? null : card.limitKurus - card.spentThisMonthKurus;
    return {
      cardId: card.id,
      name: card.name,
      totalKurus: baseKurus + gains.reduce((sum, item) => sum + item.gainKurus, 0),
      baseKurus,
      campaigns: gains.sort((a, b) => b.gainKurus - a.gainKurus),
      ifJoined: ifJoined.sort((a, b) => b.gainKurus - a.gainKurus),
      installments,
      overLimit: remaining !== null && remaining < purchase.amountKurus,
    };
  });
  // Limiti yetmeyen kart sona; sonra kazanç, eşitse katılınca kazanç.
  return advice.sort(
    (a, b) =>
      Number(a.overLimit) - Number(b.overLimit) ||
      b.totalKurus - a.totalKurus ||
      sumOf(b.ifJoined) - sumOf(a.ifJoined) ||
      a.name.localeCompare(b.name, "tr"),
  );
}

const sumOf = (items: { gainKurus: number }[]) =>
  items.reduce((sum, item) => sum + item.gainKurus, 0);
