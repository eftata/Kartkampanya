"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { setJoinedAction } from "@/lib/campaign-status-actions";

/**
 * "Katıldım" işareti: kullanıcı bankada (SMS / uygulama / web) katıldığını kendisi işaretler.
 * Durum hemen değişir; sunucu hata dönerse eski haline döner ve hata gösterilir.
 */
export function JoinToggle({ campaignId, joined }: { campaignId: string; joined: boolean }) {
  const [value, setValue] = useState(joined);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await setJoinedAction(campaignId, next);
      if (!result.ok) {
        setValue(!next);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={value ? "secondary" : "outline"}
        aria-pressed={value}
        disabled={pending}
        onClick={toggle}
      >
        {value ? "✓ Katıldım" : "Katıldım olarak işaretle"}
      </Button>
      {error && (
        <span role="alert" className="text-destructive text-xs">
          {error}
        </span>
      )}
    </div>
  );
}
