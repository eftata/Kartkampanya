"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { unsubscribeAction } from "@/lib/notifications/unsubscribe-actions";

export function UnsubscribeForm({
  params,
  label,
}: {
  params: { u: string; k: string; t: string };
  label: string;
}) {
  const [state, action, pending] = useActionState(unsubscribeAction, {});
  if (state.done) {
    return (
      <p role="status" className="space-y-2">
        <span className="block">{label} kapatıldı.</span>
        <Link href="/profil#bildirimler" className="text-muted-foreground text-sm underline">
          Bildirim tercihlerini değiştir
        </Link>
      </p>
    );
  }
  return (
    <form action={action} className="space-y-3">
      {Object.entries(params).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <p>{label} kapatılsın mı?</p>
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Evet, kapat
      </Button>
    </form>
  );
}
