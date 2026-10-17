import { AdminProgramUpdateInput } from "@kartplan/shared";

import { mutationError, parseJson, withAdmin } from "@/lib/api";
import { updateProgram, deleteProgram } from "@/lib/admin-catalog";

export function PATCH(
  request: Request,
  { params }: RouteContext<"/api/admin/catalog/programs/[id]">,
) {
  return withAdmin(async (user) => {
    const input = await parseJson(request, AdminProgramUpdateInput);
    if (!input.ok) return input.response;
    const result = await updateProgram(user, (await params).id, input.data);
    return result.ok ? new Response(null, { status: 204 }) : mutationError(result);
  });
}

export function DELETE(
  _request: Request,
  { params }: RouteContext<"/api/admin/catalog/programs/[id]">,
) {
  return withAdmin(async (user) => {
    const result = await deleteProgram(user, (await params).id);
    return result.ok ? new Response(null, { status: 204 }) : mutationError(result);
  });
}
