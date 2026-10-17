"use client";

import type { NotificationPrefs } from "@kartplan/shared";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { saveNotificationPrefsAction } from "@/lib/notification-prefs-actions";

const OPTIONS: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
  {
    key: "joinReminder",
    label: "Katılım hatırlatma",
    hint: "Kartına uyan ve katılım isteyen bir kampanya başladığında.",
  },
  {
    key: "endingSoon",
    label: "Kampanya bitmek üzere",
    hint: "Katıldığın ya da planındaki kampanyanın son 3 gününde.",
  },
  {
    key: "weeklySummary",
    label: "Haftalık plan özeti",
    hint: "Pazartesileri bu ayın planı.",
  },
];

/** Bildirim tercihleri (Profilim). Kaydet'e basınca hepsi birlikte yazılır. */
export function NotificationPrefsForm({ initial }: { initial: NotificationPrefs }) {
  const [prefs, setPrefs] = useState(initial);
  const [state, setState] = useState<{ saved?: boolean; error?: string }>({});
  const [pending, startTransition] = useTransition();

  return (
    <form
      aria-label="Bildirim tercihleri"
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        setState({});
        startTransition(async () => {
          const result = await saveNotificationPrefsAction(prefs);
          setState(result.error ? { error: result.error } : { saved: true });
        });
      }}
    >
      {OPTIONS.map((option) => (
        <label key={option.key} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={prefs[option.key]}
            onChange={(event) => setPrefs({ ...prefs, [option.key]: event.target.checked })}
            className="accent-primary mt-0.5 size-4"
          />
          <span>
            <span className="font-medium">{option.label}</span>
            <span className="text-muted-foreground block text-xs">{option.hint}</span>
          </span>
        </label>
      ))}
      <p className="text-muted-foreground text-xs">
        Bunlar yalnızca kendi kartların ve kampanyaların hakkındadır; reklam e-postası göndermeyiz.
      </p>
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          Tercihlerin kaydedildi.
        </p>
      )}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Kaydediliyor…" : "Tercihleri kaydet"}
      </Button>
    </form>
  );
}
