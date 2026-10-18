"use client";

import { useTransition } from "react";

import { deleteTransactionAction } from "@/lib/transaction-actions";

export function DeleteTransactionButton({ id, label }: { id: string; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => void (await deleteTransactionAction(id)))}
      className="text-muted-foreground hover:text-destructive text-xs underline disabled:opacity-50"
      aria-label={`Sil: ${label}`}
    >
      Sil
    </button>
  );
}
