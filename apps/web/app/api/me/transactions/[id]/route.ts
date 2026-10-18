import { withUser } from "@/lib/api";
import { deleteTransaction } from "@/lib/transactions";

export function DELETE(_request: Request, { params }: RouteContext<"/api/me/transactions/[id]">) {
  return withUser(async (user) => {
    const { id } = await params;
    const result = await deleteTransaction(user.id, id);
    return result.ok
      ? new Response(null, { status: 204 })
      : Response.json({ error: result.error }, { status: 404 });
  });
}
