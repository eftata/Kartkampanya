import "server-only";

import { getPrisma } from "@kartplan/db";
import { cache } from "react";

import { CONSENT_KINDS, LEGAL_VERSIONS } from "@/lib/legal";

type Kind = keyof typeof CONSENT_KINDS;
type Latest = { granted: boolean; version: string; at: Date } | null;

/** Türlerin en son kayıtları (her değişiklik yeni satır; geçerli olan en sonuncusu). */
export async function getConsentStatus(userId: string): Promise<Record<Kind, Latest>> {
  const rows = await getPrisma().consent.findMany({
    where: { userId, kind: { in: Object.values(CONSENT_KINDS) } },
    orderBy: { createdAt: "desc" },
    select: { kind: true, granted: true, version: true, createdAt: true },
  });
  const latest = (kind: Kind): Latest => {
    const row = rows.find((item) => item.kind === CONSENT_KINDS[kind]);
    return row ? { granted: row.granted, version: row.version, at: row.createdAt } : null;
  };
  return {
    aydinlatma: latest("aydinlatma"),
    acikRiza: latest("acikRiza"),
    pazarlama: latest("pazarlama"),
  };
}

/**
 * Hizmeti kullanmak için gerekenler güncel sürümle var mı: aydınlatma metni okundu ve yurt dışı
 * aktarım açık rızası verildi. İstek başına bir kez sorgulanır.
 */
export const hasCurrentConsent = cache(async (userId: string): Promise<boolean> => {
  const status = await getConsentStatus(userId);
  return (
    status.aydinlatma?.granted === true &&
    status.aydinlatma.version === LEGAL_VERSIONS.aydinlatma &&
    status.acikRiza?.granted === true &&
    status.acikRiza.version === LEGAL_VERSIONS.acikRiza
  );
});

/** Onay ekranı: aydınlatma + açık rıza (zorunlu) ve pazarlama (isteğe bağlı) tek işlemde. */
export async function recordConsents(userId: string, marketing: boolean) {
  await getPrisma().consent.createMany({
    data: [
      { userId, kind: CONSENT_KINDS.aydinlatma, version: LEGAL_VERSIONS.aydinlatma, granted: true },
      { userId, kind: CONSENT_KINDS.acikRiza, version: LEGAL_VERSIONS.acikRiza, granted: true },
      {
        userId,
        kind: CONSENT_KINDS.pazarlama,
        version: LEGAL_VERSIONS.pazarlama,
        granted: marketing,
      },
    ],
  });
}

/** Pazarlama izni verme / geri çekme (Profilim). Yeni satır yazılır, geçmiş korunur. */
export async function setMarketingConsent(userId: string, granted: boolean) {
  await getPrisma().consent.create({
    data: { userId, kind: CONSENT_KINDS.pazarlama, version: LEGAL_VERSIONS.pazarlama, granted },
  });
}
