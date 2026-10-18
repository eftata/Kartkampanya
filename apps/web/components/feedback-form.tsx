"use client";

import { FEEDBACK_MAX_LENGTH } from "@kartplan/shared";
import type { FeedbackKind } from "@kartplan/shared";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { sendFeedbackAction } from "@/lib/feedback-actions";
import { FEEDBACK_KIND_LABELS } from "@/lib/feedback-labels";
import { cn } from "@/lib/utils";

const KINDS = Object.keys(FEEDBACK_KIND_LABELS) as FeedbackKind[];

/**
 * Geri bildirim formu. Eylem elle çağrılır (`<form action>` hata alınca da formu sıfırlar);
 * başarıda alanlar temizlenir ve teşekkür mesajı görünür.
 */
export function FeedbackForm({ page }: { page: string | null }) {
  const [kind, setKind] = useState<FeedbackKind>("IDEA");
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<{ ok?: boolean; error?: string }>({});
  const [pending, startTransition] = useTransition();

  return (
    <form
      aria-label="Geri bildirim"
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await sendFeedbackAction({ kind, rating, message, page });
          setState(result);
          if (result.ok) {
            setMessage("");
            setRating(null);
          }
        });
      }}
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Konu</legend>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((value) => (
            <label
              key={value}
              className={cn(
                "cursor-pointer rounded-full border px-3 py-1 text-sm",
                "has-[:checked]:bg-primary has-[:checked]:text-primary-foreground",
                "has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px]",
              )}
            >
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
                className="sr-only"
              />
              {FEEDBACK_KIND_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          KartPlan&apos;ı ne kadar faydalı buluyorsun?{" "}
          <span className="text-muted-foreground font-normal">(isteğe bağlı)</span>
        </legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <label
              key={value}
              className={cn(
                "flex size-9 cursor-pointer items-center justify-center rounded-md border text-sm",
                "has-[:checked]:bg-primary has-[:checked]:text-primary-foreground",
                "has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px]",
              )}
            >
              <input
                type="radio"
                name="rating"
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                className="sr-only"
                aria-label={`${value} / 5`}
              />
              {value}
            </label>
          ))}
          {rating !== null && (
            <button
              type="button"
              onClick={() => setRating(null)}
              className="text-muted-foreground ml-2 text-xs underline"
            >
              Puanı kaldır
            </button>
          )}
        </div>
      </fieldset>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Mesajın</span>
        <textarea
          name="message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={6}
          maxLength={FEEDBACK_MAX_LENGTH}
          required
          placeholder="Ne oldu, ne bekliyordun? Bir kampanya yanlışsa adını yazman yeterli."
          className="border-input focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
        />
        <span className="text-muted-foreground block text-right text-xs">
          {message.length} / {FEEDBACK_MAX_LENGTH}
        </span>
      </label>

      <p className="text-muted-foreground text-xs">
        Kart numarası, şifre ya da kimlik bilgisi yazma. Mesajın yalnızca KartPlan ekibince okunur;
        gerekirse e-posta adresinden sana dönebiliriz.
      </p>

      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm">
          Teşekkürler, mesajın bize ulaştı.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Gönder
      </Button>
    </form>
  );
}
