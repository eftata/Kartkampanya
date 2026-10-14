import { jsonError, withUser } from "@/lib/api";
import { removeUserCard } from "@/lib/user-cards";

export function DELETE(_request: Request, { params }: RouteContext<"/api/me/cards/[id]">) {
  return withUser(async (user) => {
    const { id } = await params;
    const result = await removeUserCard(user.id, id);
    return result.ok ? new Response(null, { status: 204 }) : jsonError(404, result.error);
  });
}
