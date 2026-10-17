"use client";

import type { ReactNode } from "react";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/admin-catalog-actions";
import { cn } from "@/lib/utils";

/**
 * Admin formları için: server action'ı elle çağırır. `<form action>` her işlemden sonra formu
 * sıfırladığı için hata durumunda girilen değerler kaybolurdu; burada yalnızca istenirse sıfırlanır.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Kaydediliyor…",
  successMessage,
  confirmMessage,
  resetOnSuccess = false,
  variant = "default",
  className,
  label,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  successMessage?: string;
  confirmMessage?: string;
  resetOnSuccess?: boolean;
  variant?: "default" | "outline" | "destructive" | "secondary";
  className?: string;
  /** Erişilebilir form adı (testler ve ekran okuyucular için). */
  label?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    const formData = new FormData(event.currentTarget);
    setState({});
    startTransition(async () => {
      const result = await action(formData);
      setState(result);
      if (result.ok && resetOnSuccess) formRef.current?.reset();
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      aria-label={label}
      noValidate
      className={cn("space-y-3", className)}
    >
      {children}
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      {state.ok && successMessage && (
        <p role="status" className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm">
          {successMessage}
        </p>
      )}
      <Button type="submit" variant={variant} size="sm" disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
