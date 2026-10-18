import "server-only";

import { getPrisma } from "@kartplan/db";

import { WEEK2_TO_DAY } from "@/lib/funnel";
import type { FunnelUser } from "@/lib/funnel";
import { CONSENT_KINDS } from "@/lib/legal";

/**
 * Huni için kullanıcılar (ADR 0025): açık rıza vermiş, silinme talebi olmayan, admin olmayan
 * hesaplar. Yalnızca zamanlar ve kayıttan sonraki ilk iki haftanın kullanım günleri okunur.
 */
export async function getFunnelUsers(): Promise<FunnelUser[]> {
  const rows = await getPrisma().user.findMany({
    where: {
      role: "USER",
      deletedAt: null,
      consents: { some: { kind: CONSENT_KINDS.acikRiza, granted: true } },
    },
    select: {
      firstCardAt: true,
      firstPlanViewAt: true,
      consents: {
        where: { kind: CONSENT_KINDS.acikRiza, granted: true },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { createdAt: true },
      },
      activityDays: { select: { day: true }, orderBy: { day: "asc" } },
    },
  });
  return rows.flatMap((row) => {
    const signedUpAt = row.consents[0]?.createdAt;
    if (!signedUpAt) return [];
    const until = new Date(signedUpAt.getTime() + (WEEK2_TO_DAY + 2) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return [
      {
        signedUpAt,
        firstCardAt: row.firstCardAt,
        firstPlanViewAt: row.firstPlanViewAt,
        activeDays: row.activityDays.map((item) => item.day).filter((day) => day <= until),
      },
    ];
  });
}
