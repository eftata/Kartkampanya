import { mutationError, withUser } from "@/lib/api";
import { sendTestPush } from "@/lib/push";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/** Kayıtlı cihazlara deneme bildirimi (kullanıcı başına saatte 5). */
export function POST() {
  return withUser(async (user) => {
    const limit = await rateLimit("pushTest", user.id);
    if (!limit.ok) return tooManyRequests(limit);
    const result = await sendTestPush(user.id);
    return result.ok ? Response.json(result.data) : mutationError(result);
  });
}
