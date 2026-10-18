import { FeedbackInput } from "@kartplan/shared";

import { parseJson, withUser } from "@/lib/api";
import { createFeedback, getMyFeedback } from "@/lib/feedback";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/** Kullanıcının gönderdiği geri bildirimler (yeniden eskiye, en fazla 20). */
export function GET() {
  return withUser(async (user) => Response.json({ feedback: await getMyFeedback(user.id) }));
}

/** Geri bildirim gönder (kullanıcı başına saatte 10). */
export function POST(request: Request) {
  return withUser(async (user) => {
    const body = await parseJson(request, FeedbackInput);
    if (!body.ok) return body.response;
    const limit = await rateLimit("feedback", user.id);
    if (!limit.ok) return tooManyRequests(limit);
    const result = await createFeedback(user.id, body.data);
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return Response.json(result.data, { status: 201 });
  });
}
