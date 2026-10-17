"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { recomputePlanAction } from "@/lib/plan-actions";

export function RecomputePlanButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await recomputePlanAction();
            if (!result.ok) setError(result.error ?? "Plan hesaplanamadı.");
          })
        }
      >
        {pending ? "Hesaplanıyor…" : "Yeniden hesapla"}
      </Button>
      {error && (
        <span role="alert" className="text-destructive text-xs">
          {error}
        </span>
      )}
    </span>
  );
}
