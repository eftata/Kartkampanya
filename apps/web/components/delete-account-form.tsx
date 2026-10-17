"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { deleteAccountAction } from "@/lib/account-actions";

/** Hesap silme: e-postayı yazarak onaylanır; hesap hemen kapanır, veriler 30 gün sonra silinir. */
export function DeleteAccountForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(deleteAccountAction, {});
  return (
    <form action={action} aria-label="Hesabı sil" className="space-y-2 text-sm">
      <p>
        Hesabın hemen kapanır ve giriş yapamazsın; verilerin 30 gün içinde kalıcı olarak silinir.
        Önce verilerini indirmek isteyebilirsin.
      </p>
      <label className="block space-y-1">
        <span>
          Onaylamak için e-posta adresini yaz: <strong className="break-all">{email}</strong>
        </span>
        <input
          name="email"
          type="email"
          autoComplete="off"
          className="border-input h-9 w-full rounded-md border bg-transparent px-3"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        {pending ? "Siliniyor…" : "Hesabımı sil"}
      </Button>
    </form>
  );
}
