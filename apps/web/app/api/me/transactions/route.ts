import { TransactionInput, TransactionsQuery } from "@kartplan/shared";

import { jsonError, mutationError, parseJson, withUser } from "@/lib/api";
import { turkeyToday } from "@/lib/campaign-match";
import { addTransaction, listTransactions } from "@/lib/transactions";

/** Ayın harcamaları (`?month=YYYY-AA`, varsayılan bu ay). */
export function GET(request: Request) {
  return withUser(async (user) => {
    const query = TransactionsQuery.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success) return jsonError(400, query.error.issues[0]?.message ?? "Geçersiz istek.");
    const month = query.data.month ?? turkeyToday().slice(0, 7);
    return Response.json({ month, transactions: await listTransactions(user.id, month) });
  });
}

export function POST(request: Request) {
  return withUser(async (user) => {
    const body = await parseJson(request, TransactionInput);
    if (!body.ok) return body.response;
    const result = await addTransaction(user.id, body.data);
    return result.ok ? Response.json(result.data, { status: 201 }) : mutationError(result, 404);
  });
}
