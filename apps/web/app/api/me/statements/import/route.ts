import { StatementImportInput } from "@kartplan/shared";

import { mutationError, parseJson, withUser } from "@/lib/api";
import { importStatementRows } from "@/lib/statements";

/** Onaylanan ekstre satırlarını harcama olarak ekler (ADR 0028). */
export function POST(request: Request) {
  return withUser(async (user) => {
    const body = await parseJson(request, StatementImportInput);
    if (!body.ok) return body.response;
    const result = await importStatementRows(user.id, body.data);
    return result.ok ? Response.json(result.data, { status: 201 }) : mutationError(result);
  });
}
