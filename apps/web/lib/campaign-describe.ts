/**
 * Kampanya kuralını sade Türkçe cümleye çevirir (detay sayfası). Saf modül.
 * Ekler (TL'ye / TL'de) sayıya göre değiştiği için ek isteyen yapılar yerine "harcamaya" gibi
 * ekin sözcükte kaldığı kalıplar kullanılır.
 */
import { formatBps, formatKurus } from "@kartplan/shared";

import type { MatchRule } from "@/lib/campaign-match";

export type DescribableRule = MatchRule & {
  exclusions: string[];
  categoryNames: string[];
  merchantNames: string[];
};

export type RuleDescription = { headline: string; details: string[] };

const EXCLUSION_LABELS: Record<string, string> = {
  taksitli: "taksitli işlemler",
  nakit_avans: "nakit avans",
  iade: "iade edilen işlemler",
  ticari_kart: "ticari kartlar",
  sanal_kart: "sanal kartlar",
};

const REWARD_NOUN = {
  POINTS: "puan",
  CASHBACK: "iade",
  DISCOUNT: "indirim",
  INSTALLMENT: "ek taksit",
} as const;

function threshold(rule: MatchRule): string {
  const amount = rule.thresholdKurus ?? 0;
  switch (rule.thresholdType) {
    case "TXN_COUNT":
      return rule.tierRepeat ? `Her ${rule.txnCount ?? 1} işleme` : `${rule.txnCount ?? 1} işleme`;
    case "SINGLE":
      return amount > 0 ? `Tek seferde ${formatKurus(amount)} ve üzeri harcamaya` : "Harcamaya";
    case "CUMULATIVE":
      if (amount === 0) return "Harcamaya";
      return rule.tierRepeat
        ? `Her ${formatKurus(amount)} harcamaya`
        : `Toplam ${formatKurus(amount)} harcamaya`;
  }
}

function reward(rule: MatchRule): string {
  const noun = REWARD_NOUN[rule.rewardType];
  const parts = [
    rule.rewardKurus !== null ? formatKurus(rule.rewardKurus) : null,
    rule.rewardBps !== null ? formatBps(rule.rewardBps) : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(" + ")} ${noun}` : noun;
}

export function describeRule(rule: DescribableRule): RuleDescription {
  const details: string[] = [];
  const scope = [...rule.categoryNames, ...rule.merchantNames];
  details.push(scope.length ? `Geçerli: ${scope.join(", ")}` : "Geçerli: tüm harcamalar");
  if (rule.capKurus !== null) details.push(`En fazla ${formatKurus(rule.capKurus)}`);
  if (rule.exclusions.length) {
    const items = rule.exclusions.map((key) => EXCLUSION_LABELS[key] ?? key.replaceAll("_", " "));
    details.push(`Hariç: ${items.join(", ")}`);
  }
  return { headline: `${threshold(rule)} ${reward(rule)}`, details };
}
