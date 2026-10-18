import { purgeDeletedAccounts } from "@/lib/account";
import { jsonError } from "@/lib/api";
import { isCronRequest } from "@/lib/cron";
import { recordJob } from "@/lib/jobs";

/** Günlük: silme talebinin üzerinden 30 gün geçmiş hesapları kalıcı siler (Vercel Cron). */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return jsonError(503, "CRON_SECRET tanımlı değil.");
  if (!isCronRequest(request)) return jsonError(401, "Yetkisiz.");
  return Response.json(
    await recordJob("purge-accounts", async () => ({ purged: await purgeDeletedAccounts() })),
  );
}
