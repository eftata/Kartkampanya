/**
 * Onay öncesi kampanya kontrolleri (saf; ADR 0026). Şema doğrulamasını (zod) geçmiş ama büyük
 * olasılıkla yanlış ayıklanmış ya da yanlış yazılmış verileri yakalar.
 *
 * - "error": onay engellenir (taslak olarak kaydedilebilir).
 * - "warning": onay serbest; admin kaynağa bakıp emin olmalı.
 */
import { formatBps, formatKurus } from "@kartplan/shared";
import type { AdminCampaignInput } from "@kartplan/shared";

import { daysBetween } from "@/lib/campaign-match";

export type CheckLevel = "error" | "warning";
export type CampaignCheck = { level: CheckLevel; message: string };

/** Sabit ödülün eşiğe oranı bunun üstündeyse şüpheli (ör. 1.000 TL'ye 600 TL). */
const SUSPICIOUS_REWARD_SHARE = 0.5;
/** Oransal ödülde şüpheli yüksek oran (%20). */
const SUSPICIOUS_BPS = 2000;
const LONG_CAMPAIGN_DAYS = 120;
const FAR_START_DAYS = 60;

export function campaignChecks(input: AdminCampaignInput, today: string): CampaignCheck[] {
  const checks: CampaignCheck[] = [];
  const error = (message: string) => checks.push({ level: "error", message });
  const warn = (message: string) => checks.push({ level: "warning", message });

  if (input.joinDeadline && input.joinDeadline > input.endsAt) {
    error("Son katılım tarihi kampanya bitişinden sonra.");
  }
  if (input.joinDeadline && input.joinDeadline < input.startsAt) {
    warn("Son katılım tarihi kampanya başlangıcından önce.");
  }
  if (input.joinMethod === "AUTO" && input.joinDeadline) {
    warn("Katılım otomatik ama son katılım tarihi var; katılım yöntemi doğru mu?");
  }
  const days = daysBetween(input.startsAt, input.endsAt);
  if (days > LONG_CAMPAIGN_DAYS) warn(`Kampanya ${days} gün sürüyor; tarihler doğru mu?`);
  if (input.startsAt > today && daysBetween(today, input.startsAt) > FAR_START_DAYS) {
    warn("Kampanya iki aydan uzun süre sonra başlıyor; yıl doğru mu?");
  }

  input.rules.forEach((rule, index) => {
    const where = input.rules.length > 1 ? `Kural ${index + 1}: ` : "";
    const threshold = rule.thresholdKurus ?? 0;
    const counted = rule.thresholdType === "TXN_COUNT";

    if (!counted && threshold === 0 && rule.tierRepeat) {
      error(`${where}eşik 0 iken "her … harcamaya" tekrarı sınırsız ödül demek; eşiği yaz.`);
    }
    if (rule.rewardKurus !== null && !counted && threshold > 0) {
      if (rule.rewardKurus >= threshold) {
        error(
          `${where}ödül (${formatKurus(rule.rewardKurus)}) eşikten (${formatKurus(threshold)}) büyük ya da eşit.`,
        );
      } else if (rule.rewardKurus > threshold * SUSPICIOUS_REWARD_SHARE) {
        warn(
          `${where}ödül eşiğin yarısından fazla (${formatKurus(rule.rewardKurus)} / ${formatKurus(threshold)}); bir sıfır eksik/fazla olabilir.`,
        );
      }
    }
    if (rule.rewardBps !== null && rule.rewardBps > SUSPICIOUS_BPS) {
      warn(`${where}ödül oranı ${formatBps(rule.rewardBps)}; bu kadar yüksek oran nadirdir.`);
    }
    if (rule.capKurus !== null && rule.rewardKurus !== null && rule.capKurus < rule.rewardKurus) {
      error(
        `${where}üst limit (${formatKurus(rule.capKurus)}) tek kademenin ödülünden (${formatKurus(rule.rewardKurus)}) küçük.`,
      );
    }
    if (rule.tierRepeat && rule.capKurus === null && rule.rewardType !== "INSTALLMENT") {
      warn(`${where}kademe tekrarlanıyor ama üst limit yok; kaynakta "en fazla" tutarı var mı?`);
    }
    if (rule.rewardBps !== null && rule.capKurus === null && rule.rewardType !== "INSTALLMENT") {
      warn(`${where}oransal ödülde üst limit yok; kaynakta "en fazla" tutarı var mı?`);
    }
    if (rule.categoryIds.length === 0 && rule.merchantIds.length === 0) {
      warn(`${where}kategori ya da marka yok: tüm harcamalara uygulanacak.`);
    }
  });
  return checks;
}

export const hasBlockingCheck = (checks: CampaignCheck[]) =>
  checks.some((check) => check.level === "error");

const words = (title: string) =>
  new Set(
    title
      .toLocaleLowerCase("tr-TR")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(" ")
      .filter((word) => word.length > 1),
  );

/** Başlık benzerliği (kelime kümelerinin Jaccard oranı, 0–1): mükerrer kampanya uyarısı için. */
export function titleSimilarity(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (left.size === 0 || right.size === 0) return 0;
  const common = [...left].filter((word) => right.has(word)).length;
  return common / (left.size + right.size - common);
}

export const SIMILAR_TITLE_THRESHOLD = 0.6;
