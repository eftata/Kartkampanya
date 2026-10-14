"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { signInWithEmail } from "@/lib/auth/actions";
import type { EmailSignInState } from "@/lib/auth/actions";

export function EmailSignInForm() {
  const [state, formAction, pending] = useActionState<EmailSignInState, FormData>(
    signInWithEmail,
    {},
  );

  return (
    <form action={formAction} className="space-y-3" noValidate>
      <label htmlFor="email" className="text-sm font-medium">
        E-posta
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.email}
        key={state.email}
        placeholder="ornek@eposta.com"
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "email-error" : undefined}
        className="border-input focus-visible:ring-ring/50 h-10 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]"
      />
      {state.error && (
        <p id="email-error" role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Gönderiliyor…" : "Giriş bağlantısı gönder"}
      </Button>
    </form>
  );
}
