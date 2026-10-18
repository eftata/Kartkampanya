"use server";

import { TransactionInput } from "@kartplan/shared";
import { refresh } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { addTransaction, deleteTransaction } from "@/lib/transactions";

/** Harcama ekle (istemci `startTransition` ile çağırır; hata alınca form değerleri korunur). */
export async function addTransactionAction(
  input: unknown,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await requireUser();
  const parsed = TransactionInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi." };
  const result = await addTransaction(user.id, parsed.data);
  if (!result.ok) return { error: result.error };
  refresh();
  return { ok: true };
}

export async function deleteTransactionAction(id: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const result = await deleteTransaction(user.id, id);
  if (!result.ok) return { error: result.error };
  refresh();
  return {};
}
