import { jsonError } from "@/lib/api";
import { unsubscribe } from "@/lib/notifications/prefs";
import { verifyUnsubscribe } from "@/lib/notifications/unsubscribe";

/**
 * Tek tıkla abonelikten çıkma (RFC 8058, `List-Unsubscribe-Post`). Oturum istemez; bağlantı
 * imzalıdır. Tarayıcıdaki onay sayfası `/abonelik`.
 */
export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  const verified = verifyUnsubscribe(
    { u: params.get("u"), k: params.get("k"), t: params.get("t") },
    process.env.AUTH_SECRET ?? "",
  );
  if (!verified) return jsonError(400, "Geçersiz bağlantı.");
  if (!(await unsubscribe(verified.userId, verified.target))) return jsonError(404, "Bulunamadı.");
  return new Response(null, { status: 204 });
}
