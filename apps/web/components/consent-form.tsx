"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { giveConsentAction } from "@/lib/account-actions";

/**
 * `<form action>` her eylemden sonra formu sıfırlar (hata dönse bile); işaretlenenler kaybolmasın
 * diye eylem elle çağrılır. Başarıda eylem `/plan`'a yönlendirir.
 */
export function ConsentForm({ texts }: { texts: { acikRiza: string; pazarlama: string } }) {
  const [state, setState] = useState<{ error?: string }>({});
  const [pending, startTransition] = useTransition();
  const [checked, setChecked] = useState({ aydinlatma: false, acikRiza: false, pazarlama: false });
  const box = (name: keyof typeof checked) => ({
    name,
    type: "checkbox" as const,
    checked: checked[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setChecked((current) => ({ ...current, [name]: event.target.checked })),
    className: "accent-primary mt-0.5 size-4",
  });
  return (
    <form
      aria-label="KVKK onayı"
      className="space-y-4 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => setState(await giveConsentAction({}, formData)));
      }}
    >
      <label className="flex items-start gap-2">
        <input {...box("aydinlatma")} />
        <span>
          <Link href="/aydinlatma" target="_blank" className="underline">
            KVKK Aydınlatma Metni
          </Link>
          &apos;ni okudum. <span className="text-muted-foreground">(zorunlu)</span>
        </span>
      </label>
      <label className="flex items-start gap-2">
        <input {...box("acikRiza")} />
        <span>
          {texts.acikRiza} <span className="text-muted-foreground">(zorunlu)</span>
        </span>
      </label>
      <label className="flex items-start gap-2">
        <input {...box("pazarlama")} />
        <span>{texts.pazarlama}</span>
      </label>
      {state.error && (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Onayla ve devam et
      </Button>
    </form>
  );
}
