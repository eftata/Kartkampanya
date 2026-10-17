import { appBaseUrl, isCronRequest } from "@/lib/cron";
import { jsonError } from "@/lib/api";
import { runNotifications } from "@/lib/notifications/run";

// Bütün kullanıcıları dolaşır; Vercel'de varsayılan süre sınırı yetmeyebilir.
export const maxDuration = 300;

/**
 * Günlük bildirim işi (Vercel Cron). `?weekly=1` haftalık özeti Pazartesi beklemeden gönderir,
 * `?user=<id>` yalnızca o kullanıcıyı işler (elle deneme ve e2e).
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return jsonError(503, "CRON_SECRET tanımlı değil.");
  if (!isCronRequest(request)) return jsonError(401, "Yetkisiz.");
  const secret = process.env.AUTH_SECRET;
  if (!secret) return jsonError(503, "AUTH_SECRET tanımlı değil.");
  const params = new URL(request.url).searchParams;
  const user = params.get("user");
  const stats = await runNotifications({
    base: appBaseUrl(request),
    secret,
    forceWeekly: params.get("weekly") === "1",
    ...(user ? { userIds: [user] } : {}),
  });
  return Response.json(stats);
}
