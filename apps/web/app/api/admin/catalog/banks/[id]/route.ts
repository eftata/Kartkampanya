import { AdminBankInput } from "@kartplan/shared";

import { mutationError, parseJson, withAdmin } from "@/lib/api";
import { updateBank, deleteBank } from "@/lib/admin-catalog";

export function PATCH(request: Request, { params }: RouteContext<"/api/admin/catalog/banks/[id]">) {
  return withAdmin(async (user) => {
    const input = await parseJson(request, AdminBankInput);
    if (!input.ok) return input.response;
    const result = await updateBank(user, (await params).id, input.data);
    return result.ok ? new Response(null, { status: 204 }) : mutationError(result);
  });
}

export function DELETE(
  _request: Request,
  { params }: RouteContext<"/api/admin/catalog/banks/[id]">,
) {
  return withAdmin(async (user) => {
    const result = await deleteBank(user, (await params).id);
    return result.ok ? new Response(null, { status: 204 }) : mutationError(result);
  });
}
