import { PushSubscriptionInput, PushUnsubscribeInput } from "@kartplan/shared";

import { mutationError, parseJson, withUser } from "@/lib/api";
import { deletePushSubscription, getPushStatus, savePushSubscription } from "@/lib/push";

/** Push açık mı, VAPID açık anahtarı ve kayıtlı cihaz sayısı. */
export function GET() {
  return withUser(async (user) => Response.json(await getPushStatus(user.id)));
}

/** Bu cihazı kaydet (tarayıcının `PushSubscription.toJSON()` çıktısı). */
export function POST(request: Request) {
  return withUser(async (user) => {
    const body = await parseJson(request, PushSubscriptionInput);
    if (!body.ok) return body.response;
    const result = await savePushSubscription(user.id, body.data);
    if (!result.ok) return mutationError(result);
    return Response.json(await getPushStatus(user.id), { status: 201 });
  });
}

/** Bu cihazın kaydını sil. */
export function DELETE(request: Request) {
  return withUser(async (user) => {
    const body = await parseJson(request, PushUnsubscribeInput);
    if (!body.ok) return body.response;
    await deletePushSubscription(user.id, body.data.endpoint);
    return Response.json(await getPushStatus(user.id));
  });
}
