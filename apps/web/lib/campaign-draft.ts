import { AdminCampaignInput, formatBps, parsePercentInput, parseTlInput } from "@kartplan/shared";
import type { CampaignRuleInput } from "@kartplan/shared";

/**
 * Onay formunun durumu: kullanıcının yazdığı haliyle metin alanları (TL ve yüzde). Sunucu
 * `draftToInput` ile kuruş/bps'ye çevirip `AdminCampaignInput` ile doğrular.
 */
export type RuleDraft = {
  categoryIds: string[];
  merchantIds: string[];
  thresholdType: string;
  threshold: string; // TL
  txnCount: string;
  tierRepeat: boolean;
  rewardType: string;
  reward: string; // TL
  rewardRate: string; // yüzde
  cap: string; // TL
  exclusions: string; // virgülle ayrılmış
};

export type CampaignDraft = {
  title: string;
  summary: string[];
  startsAt: string;
  endsAt: string;
  joinMethod: string;
  joinDeadline: string;
  cardIds: string[];
  rules: RuleDraft[];
};

/** Kuruşu düzenlenebilir TL metnine çevirir: 250000 → "2.500", 9990 → "99,90". */
export function kurusToInput(kurus: number | null): string {
  if (kurus === null) return "";
  const whole = Math.trunc(kurus / 100).toLocaleString("tr-TR");
  const fraction = kurus % 100;
  return fraction ? `${whole},${String(fraction).padStart(2, "0")}` : whole;
}

export const emptyRule = (): RuleDraft => ({
  categoryIds: [],
  merchantIds: [],
  thresholdType: "CUMULATIVE",
  threshold: "",
  txnCount: "",
  tierRepeat: false,
  rewardType: "POINTS",
  reward: "",
  rewardRate: "",
  cap: "",
  exclusions: "",
});

export function ruleToDraft(rule: CampaignRuleInput): RuleDraft {
  return {
    categoryIds: rule.categoryIds,
    merchantIds: rule.merchantIds,
    thresholdType: rule.thresholdType,
    threshold: kurusToInput(rule.thresholdKurus),
    txnCount: rule.txnCount === null ? "" : String(rule.txnCount),
    tierRepeat: rule.tierRepeat,
    rewardType: rule.rewardType,
    reward: kurusToInput(rule.rewardKurus),
    rewardRate: rule.rewardBps === null ? "" : formatBps(rule.rewardBps).slice(1),
    cap: kurusToInput(rule.capKurus),
    exclusions: rule.exclusions.join(", "),
  };
}

const FIELD_LABELS: Record<string, string> = {
  title: "Başlık",
  summary: "Özet",
  startsAt: "Başlangıç",
  endsAt: "Bitiş",
  joinMethod: "Katılım",
  joinDeadline: "Son katılım",
  cardIds: "Kartlar",
  rules: "Kurallar",
  thresholdKurus: "Eşik",
  txnCount: "İşlem adedi",
  rewardKurus: "Ödül",
  rewardBps: "Ödül oranı",
  capKurus: "Üst limit",
  categoryIds: "Kategoriler",
  merchantIds: "Markalar",
  exclusions: "Hariçler",
};

type Converted = { ok: true; data: AdminCampaignInput } | { ok: false; error: string };

/** Formu API girdisine çevirir ve doğrular; hata mesajı hangi kural/alan olduğunu söyler. */
export function draftToInput(draft: CampaignDraft): Converted {
  const errors: string[] = [];
  const money = (raw: string, where: string) => {
    const value = parseTlInput(raw);
    if (value === null) errors.push(`${where}: tutarı TL olarak yaz (ör. 2.500).`);
    return value ?? null;
  };
  const rules = draft.rules.map((rule, index) => {
    const where = (field: string) => `Kural ${index + 1} · ${field}`;
    const rate = parsePercentInput(rule.rewardRate);
    if (rate === null) errors.push(`${where("Ödül oranı")}: oranı yüzde olarak yaz (ör. 5).`);
    const count = rule.txnCount.trim();
    if (count && !/^\d+$/.test(count)) errors.push(`${where("İşlem adedi")}: sayı yaz.`);
    return {
      categoryIds: rule.categoryIds,
      merchantIds: rule.merchantIds,
      thresholdType: rule.thresholdType,
      thresholdKurus: money(rule.threshold, where("Eşik")),
      txnCount: count ? Number(count) : null,
      tierRepeat: rule.tierRepeat,
      rewardType: rule.rewardType,
      rewardKurus: money(rule.reward, where("Ödül")),
      rewardBps: rate ?? null,
      capKurus: money(rule.cap, where("Üst limit")),
      exclusions: rule.exclusions
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    };
  });
  if (errors[0]) return { ok: false, error: errors[0] };

  const parsed = AdminCampaignInput.safeParse({
    title: draft.title,
    summary: draft.summary.map((line) => line.trim()).filter(Boolean),
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
    joinMethod: draft.joinMethod,
    joinDeadline: draft.joinDeadline || null,
    cardIds: draft.cardIds,
    rules,
  });
  if (parsed.success) return { ok: true, data: parsed.data };
  const issue = parsed.error.issues[0];
  if (!issue) return { ok: false, error: "Geçersiz bilgi." };
  const [first, index, field] = issue.path;
  const label =
    first === "rules" && typeof index === "number"
      ? `Kural ${index + 1}${typeof field === "string" && FIELD_LABELS[field] ? ` · ${FIELD_LABELS[field]}` : ""}`
      : typeof first === "string"
        ? (FIELD_LABELS[first] ?? first)
        : "";
  return { ok: false, error: label ? `${label}: ${issue.message}` : issue.message };
}
