// Tek alışveriş: "Bu tutarı bu kategoride hangi kartla ödemeliyim?" Hiçbir şey kaydetmez.

import { applyBps } from "./money";
import { campaignReward, eligibleCards } from "./optimizer";
import type { Campaign, CatalogCard, CategorySlug } from "./types";

export type AdviceCampaign = {
  campaign: Campaign;
  rewardKurus: number;
  /** Eşiğe ulaşmak için eksik tutar (ödül 0 ise). */
  missingKurus: number;
  needsJoin: boolean;
};

export type CardAdvice = {
  card: CatalogCard;
  baseKurus: number;
  campaigns: AdviceCampaign[];
  totalKurus: number;
};

export function advise(input: {
  cards: CatalogCard[];
  campaigns: Campaign[];
  joined: Record<string, boolean>;
  amountKurus: number;
  category: CategorySlug;
  day: string;
}): CardAdvice[] {
  const { amountKurus, category, day, joined } = input;
  const active = input.campaigns.filter(
    (c) =>
      c.status === "yayinda" &&
      c.startsAt <= day &&
      c.endsAt >= day &&
      (c.category === "tumu" || c.category === category),
  );
  return input.cards
    .map((card) => {
      const baseKurus = applyBps(amountKurus, card.baseRateBps);
      const campaigns = active
        .filter((c) => eligibleCards(c, [card]).length > 0)
        .map((c) => {
          const rewardKurus = campaignReward(c, amountKurus);
          return {
            campaign: c,
            rewardKurus,
            missingKurus: rewardKurus > 0 ? 0 : Math.max(0, c.minSpendKurus - amountKurus),
            needsJoin: c.requiresJoin && !joined[c.id],
          };
        })
        .sort((a, b) => b.rewardKurus - a.rewardKurus);
      const totalKurus = baseKurus + campaigns.reduce((s, x) => s + x.rewardKurus, 0);
      return { card, baseKurus, campaigns, totalKurus };
    })
    .sort((a, b) => b.totalKurus - a.totalKurus || a.card.name.localeCompare(b.card.name, "tr"));
}
