"use client";

import { formatKurus } from "@kartplan/shared";
import type { SpendCategory, SpendProfileDto } from "@kartplan/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { saveSpendProfileAction } from "@/lib/spend-profile-actions";
import { cn } from "@/lib/utils";

/** Kaydırıcı aralığı (TL). Daha yüksek tutarlar sayı alanından girilebilir. */
const SLIDER_MAX_TL = 20_000;
const SLIDER_STEP_TL = 250;
const INPUT_MAX_TL = 1_000_000;
const DEFAULT_TL = 1_000;

type Selection = { amountTl: number; merchantIds: string[] };

export function SpendProfileForm({
  categories,
  initial,
  submitLabel,
  redirectTo,
}: {
  categories: SpendCategory[];
  initial: SpendProfileDto;
  submitLabel: string;
  /** Verilirse kayıttan sonra buraya gider; verilmezse sayfada kalıp "Kaydedildi" gösterir. */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Record<string, Selection>>(() =>
    Object.fromEntries(
      initial.items.map((item) => [
        item.categoryId,
        { amountTl: Math.round(item.monthlyKurus / 100), merchantIds: item.merchantIds },
      ]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const totalTl = Object.values(selected).reduce((sum, s) => sum + s.amountTl, 0);

  function toggleCategory(id: string) {
    setSaved(false);
    setSelected((current) => {
      const next = { ...current };
      if (next[id]) delete next[id];
      else next[id] = { amountTl: DEFAULT_TL, merchantIds: [] };
      return next;
    });
  }

  function update(id: string, change: Partial<Selection>) {
    setSaved(false);
    setSelected((current) => {
      const prev = current[id];
      return prev ? { ...current, [id]: { ...prev, ...change } } : current;
    });
  }

  function toggleMerchant(categoryId: string, merchantId: string) {
    const ids = selected[categoryId]?.merchantIds ?? [];
    update(categoryId, {
      merchantIds: ids.includes(merchantId)
        ? ids.filter((id) => id !== merchantId)
        : [...ids, merchantId],
    });
  }

  function submit() {
    setError(null);
    setSaved(false);
    // Kategori sırası katalogdaki gibi kalsın.
    const items = categories
      .filter((c) => selected[c.id])
      .map((c) => ({
        categoryId: c.id,
        monthlyKurus: (selected[c.id]?.amountTl ?? 0) * 100,
        merchantIds: selected[c.id]?.merchantIds ?? [],
      }));
    startTransition(async () => {
      const result = await saveSpendProfileAction({ items });
      if (result.error) setError(result.error);
      else if (redirectTo) router.push(redirectTo);
      else setSaved(true);
    });
  }

  return (
    <div className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="mb-2 font-medium">Hangi alanlarda harcama yapıyorsun?</legend>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => {
            const on = Boolean(selected[c.id]);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleCategory(c.id)}
                className={cn(
                  "focus-visible:ring-ring/50 rounded-full border px-4 py-2 text-sm transition-colors outline-none focus-visible:ring-[3px]",
                  on ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent",
                )}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      {categories
        .filter((c) => selected[c.id])
        .map((c) => {
          const sel = selected[c.id]!;
          const inputId = `amount-${c.slug}`;
          return (
            <section
              key={c.id}
              aria-label={c.name}
              className="space-y-4 rounded-xl border p-4 sm:p-5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-medium">{c.name}</h3>
                <span className="text-muted-foreground text-sm">
                  {formatKurus(sel.amountTl * 100)} / ay
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={SLIDER_MAX_TL}
                  step={SLIDER_STEP_TL}
                  value={Math.min(sel.amountTl, SLIDER_MAX_TL)}
                  onChange={(e) => update(c.id, { amountTl: Number(e.target.value) })}
                  aria-label={`${c.name} aylık tutar kaydırıcısı`}
                  className="accent-primary h-2 flex-1"
                />
                <label htmlFor={inputId} className="sr-only">
                  {c.name} aylık tutar (TL)
                </label>
                <div className="relative w-32">
                  <input
                    id={inputId}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={INPUT_MAX_TL}
                    step={50}
                    value={sel.amountTl}
                    onChange={(e) =>
                      update(c.id, {
                        amountTl: Math.min(
                          INPUT_MAX_TL,
                          Math.max(0, Math.round(Number(e.target.value) || 0)),
                        ),
                      })
                    }
                    className="border-input focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent pr-9 pl-3 text-right text-sm outline-none focus-visible:ring-[3px]"
                  />
                  <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">
                    TL
                  </span>
                </div>
              </div>
              {c.merchants.length > 0 && (
                <div className="space-y-2">
                  <p className="text-muted-foreground text-sm">
                    Sık kullandığın markalar (isteğe bağlı)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {c.merchants.map((m) => {
                      const on = sel.merchantIds.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleMerchant(c.id, m.id)}
                          className={cn(
                            "focus-visible:ring-ring/50 rounded-md border px-3 py-1 text-sm transition-colors outline-none focus-visible:ring-[3px]",
                            on
                              ? "bg-primary text-primary-foreground border-primary"
                              : "hover:bg-accent",
                          )}
                        >
                          {m.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          );
        })}

      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          Aylık toplam: <strong data-testid="spend-total">{formatKurus(totalTl * 100)}</strong>
        </p>
        <Button
          type="button"
          onClick={submit}
          disabled={pending || Object.keys(selected).length === 0}
        >
          {pending ? "Kaydediliyor…" : submitLabel}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm">
          Harcama profilin kaydedildi.
        </p>
      )}
    </div>
  );
}
