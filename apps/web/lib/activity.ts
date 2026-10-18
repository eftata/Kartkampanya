import "server-only";

import { getPrisma } from "@kartplan/db";
import { after } from "next/server";

import { turkeyToday } from "@/lib/campaign-match";

/**
 * Huni ölçümü için kullanım kayıtları (ADR 0025): kullanıcının uygulamayı açtığı günler ve ilk
 * kart / ilk plan görüntüleme anı. Yalnızca gün ve zaman; hangi sayfa ya da ne yapıldığı yok.
 */

/** Kullanım günleri bu kadar gün saklanır (günlük temizlik işinde silinir). */
export const ACTIVITY_RETENTION_DAYS = 180;

// Aynı süreçte aynı gün için tekrar yazmasın (her istek veritabanına gitmesin).
const seen = new Set<string>();

function later(task: () => Promise<unknown>) {
  const run = () =>
    task().catch((error: unknown) =>
      console.error("[activity]", error instanceof Error ? error.message : error),
    );
  try {
    after(run);
  } catch {
    void run(); // istek dışında (test, betik)
  }
}

/** Kullanıcının bugün uygulamayı kullandığını not eder (yanıttan sonra, günde bir satır). */
export function noteActivity(userId: string, now = new Date()) {
  const day = turkeyToday(now);
  const key = `${userId}:${day}`;
  if (seen.has(key)) return;
  if (seen.size > 50_000) seen.clear();
  seen.add(key);
  later(() =>
    getPrisma().userActivityDay.createMany({ data: [{ userId, day }], skipDuplicates: true }),
  );
}

/** İlk kart eklendiği an (yalnızca boşsa yazılır). */
export function markFirstCard(userId: string, at = new Date()) {
  later(() =>
    getPrisma().user.updateMany({
      where: { id: userId, firstCardAt: null },
      data: { firstCardAt: at },
    }),
  );
}

/** Planın ilk kez görüldüğü an (yalnızca boşsa yazılır). */
export function markPlanViewed(userId: string, at = new Date()) {
  later(() =>
    getPrisma().user.updateMany({
      where: { id: userId, firstPlanViewAt: null },
      data: { firstPlanViewAt: at },
    }),
  );
}

/** Saklama süresi dolan kullanım günlerini siler; silinen satır sayısı. */
export async function pruneActivity(now = new Date()): Promise<number> {
  const cutoff = turkeyToday(new Date(now.getTime() - ACTIVITY_RETENTION_DAYS * 86_400_000));
  const { count } = await getPrisma().userActivityDay.deleteMany({
    where: { day: { lt: cutoff } },
  });
  return count;
}
