import { AddUserCardInput } from "@kartplan/shared";

import { jsonError, parseJson, withUser } from "@/lib/api";
import { addUserCard, listUserCards } from "@/lib/user-cards";
import type { MutationErrorCode } from "@/lib/user-cards";

const STATUS: Record<MutationErrorCode, number> = { not_found: 400, conflict: 409, limit: 422 };

export function GET() {
  return withUser(async (user) => Response.json({ cards: await listUserCards(user.id) }));
}

export function POST(request: Request) {
  return withUser(async (user) => {
    const input = await parseJson(request, AddUserCardInput);
    if (!input.ok) return input.response;
    const result = await addUserCard(user.id, input.data);
    if (result.ok) return Response.json({ card: result.data }, { status: 201 });
    return jsonError(STATUS[result.code], result.error);
  });
}
