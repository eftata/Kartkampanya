import { AdminCardCreateInput } from "@kartplan/shared";

import { mutationError, parseJson, withAdmin } from "@/lib/api";
import { createCard } from "@/lib/admin-catalog";

export function POST(request: Request) {
  return withAdmin(async (user) => {
    const input = await parseJson(request, AdminCardCreateInput);
    if (!input.ok) return input.response;
    const result = await createCard(user, input.data);
    // Üst kayıt (banka/program) yoksa 400: istek gövdesi geçersiz bir kimlik taşıyor.
    return result.ok ? Response.json(result.data, { status: 201 }) : mutationError(result, 400);
  });
}
