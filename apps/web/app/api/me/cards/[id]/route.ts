import { UpdateUserCardInput } from "@kartplan/shared";

import { jsonError, parseJson, withUser } from "@/lib/api";
import { removeUserCard, updateUserCard } from "@/lib/user-cards";

export function DELETE(_request: Request, { params }: RouteContext<"/api/me/cards/[id]">) {
  return withUser(async (user) => {
    const { id } = await params;
    const result = await removeUserCard(user.id, id);
    return result.ok ? new Response(null, { status: 204 }) : jsonError(404, result.error);
  });
}

export function PATCH(request: Request, { params }: RouteContext<"/api/me/cards/[id]">) {
  return withUser(async (user) => {
    const input = await parseJson(request, UpdateUserCardInput);
    if (!input.ok) return input.response;
    const { id } = await params;
    const result = await updateUserCard(user.id, id, input.data);
    return result.ok ? Response.json({ card: result.data }) : jsonError(404, result.error);
  });
}
