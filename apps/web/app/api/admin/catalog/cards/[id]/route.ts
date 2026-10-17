import { AdminCardUpdateInput } from "@kartplan/shared";

import { mutationError, parseJson, withAdmin } from "@/lib/api";
import { updateCard, deleteCard } from "@/lib/admin-catalog";

export function PATCH(request: Request, { params }: RouteContext<"/api/admin/catalog/cards/[id]">) {
  return withAdmin(async (user) => {
    const input = await parseJson(request, AdminCardUpdateInput);
    if (!input.ok) return input.response;
    const result = await updateCard(user, (await params).id, input.data);
    return result.ok ? new Response(null, { status: 204 }) : mutationError(result);
  });
}

export function DELETE(
  _request: Request,
  { params }: RouteContext<"/api/admin/catalog/cards/[id]">,
) {
  return withAdmin(async (user) => {
    const result = await deleteCard(user, (await params).id);
    return result.ok ? new Response(null, { status: 204 }) : mutationError(result);
  });
}
