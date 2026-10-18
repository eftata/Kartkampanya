import { PurchaseAdviceInput } from "@kartplan/shared";

import { mutationError, parseJson, withUser } from "@/lib/api";
import { getPurchaseAdvice } from "@/lib/purchase-advice";

/** Tek alışveriş: hangi kartla ne kazanırsın (hiçbir şey kaydedilmez). */
export function POST(request: Request) {
  return withUser(async (user) => {
    const body = await parseJson(request, PurchaseAdviceInput);
    if (!body.ok) return body.response;
    const result = await getPurchaseAdvice(user.id, body.data);
    return result.ok ? Response.json(result.data) : mutationError(result, 404);
  });
}
