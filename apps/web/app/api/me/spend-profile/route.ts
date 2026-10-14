import { SpendProfileInput } from "@kartplan/shared";

import { jsonError, parseJson, withUser } from "@/lib/api";
import { getSpendProfile, saveSpendProfile } from "@/lib/spend-profile";

export function GET() {
  return withUser(async (user) => Response.json(await getSpendProfile(user.id)));
}

export function PUT(request: Request) {
  return withUser(async (user) => {
    const input = await parseJson(request, SpendProfileInput);
    if (!input.ok) return input.response;
    const result = await saveSpendProfile(user.id, input.data);
    return result.ok ? Response.json(result.data) : jsonError(400, result.error);
  });
}
