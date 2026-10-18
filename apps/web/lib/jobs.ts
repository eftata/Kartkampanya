import "server-only";

import { getPrisma } from "@kartplan/db";
import type { Prisma } from "@kartplan/db";
import * as Sentry from "@sentry/nextjs";

import { scrubText } from "@/lib/telemetry/scrub";

/** Web'deki zamanlanmış işler ve en geç ne kadar arayla başarıyla çalışmaları gerektiği. */
export const JOBS = {
  notifications: { label: "Bildirim e-postaları", maxAgeHours: 26 },
  "purge-accounts": { label: "Silinen hesaplar ve eski kullanım günleri", maxAgeHours: 26 },
} as const;
export type JobName = keyof typeof JOBS;

/** Veri hattı (Railway cron) kaynak başına günde bir çalışır. */
export const PIPELINE_MAX_AGE_HOURS = 26;

/**
 * İşi `JobRun` kaydıyla çalıştırır: başta RUNNING, sonunda SUCCEEDED + özet (yalnızca sayılar) ya
 * da FAILED + temizlenmiş hata mesajı. Hata Sentry'ye bildirilir ve yeniden fırlatılır.
 */
export async function recordJob<T extends Prisma.InputJsonObject>(
  name: JobName,
  run: () => Promise<T>,
): Promise<T> {
  const prisma = getPrisma();
  const { id } = await prisma.jobRun.create({ data: { name }, select: { id: true } });
  try {
    const summary = await run();
    await prisma.jobRun.update({
      where: { id },
      data: { status: "SUCCEEDED", finishedAt: new Date(), summary },
    });
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.jobRun.update({
      where: { id },
      data: { status: "FAILED", finishedAt: new Date(), error: scrubText(message).slice(0, 500) },
    });
    Sentry.captureException(error, { tags: { job: name } });
    throw error;
  }
}
