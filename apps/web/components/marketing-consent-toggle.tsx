"use client";

import { useState, useTransition } from "react";

import { setMarketingConsentAction } from "@/lib/account-actions";

/** Pazarlama izni: her değişiklik yeni bir rıza kaydı yazar (geçmiş korunur). */
export function MarketingConsentToggle({ granted, text }: { granted: boolean; text: string }) {
  const [value, setValue] = useState(granted);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={value}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.checked;
          setValue(next);
          setSaved(false);
          startTransition(async () => {
            const result = await setMarketingConsentAction(next);
            if (result.saved) setSaved(true);
            else setValue(!next);
          });
        }}
        className="accent-primary mt-0.5 size-4"
      />
      <span>
        {text}
        {saved && (
          <span role="status" className="ml-1 text-emerald-700 dark:text-emerald-400">
            Kaydedildi.
          </span>
        )}
      </span>
    </label>
  );
}
