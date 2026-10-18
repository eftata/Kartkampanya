import { purgeDeletedAccounts } from "@/lib/account";
import { pruneActivity } from "@/lib/activity";
import { jsonError } from "@/lib/api";
import { isCronRequest } from "@/lib/cron";
import { recordJob } from "@/lib/jobs";

/**
 * Günlük (Vercel Cron): silme talebinin üzerinden 30 gün geçmiş hesapları kalıcı siler ve saklama
 * süresi dolan kullanım günlerini (huni ölçümü) temizler.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return jsonError(503, "CRON_SECRET tanımlı değil.");
  if (!isCronRequest(request)) return jsonError(401, "Yetkisiz.");
  return Response.json(
    await recordJob("purge-accounts", async () => ({
      purged: await purgeDeletedAccounts(),
      activityDaysPruned: await pruneActivity(),
    })),
  );
}
