"use client";

import { formatKurus } from "@kartplan/shared";
import type { StatementReview, StatementReviewRow } from "@kartplan/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const fieldClass =
  "border-input focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px]";

type Row = StatementReviewRow & { selected: boolean };
type ReviewState = Omit<StatementReview, "rows"> & { rows: Row[] };

const dayFormat = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * 1. Kart + PDF (+ parola) → motor satırları çıkarır.
 * 2. Kullanıcı satırları onaylar: mükerrer ve tarih dışı satırlar seçili gelmez, kategorisi
 *    tanınmayan satır için kategori seçilmeli. Yalnızca seçilenler eklenir.
 */
export function StatementImport({
  cards,
  categories,
}: {
  cards: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [card, setCard] = useState(cards[0]?.id ?? "");
  const [review, setReview] = useState<ReviewState | null>(null);
  const [error, setError] = useState<string>();
  const [needsPassword, setNeedsPassword] = useState(false);
  const [imported, setImported] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = review?.rows.filter((row) => row.selected) ?? [];
  const missingCategory = selected.some((row) => !row.categoryId);
  const update = (index: number, patch: Partial<Row>) =>
    setReview(
      (current) =>
        current && {
          ...current,
          rows: current.rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
        },
    );

  if (imported !== null) {
    return (
      <div role="status" className="space-y-3 rounded-xl border p-4">
        <p className="font-medium">{imported} harcama eklendi.</p>
        <p className="text-muted-foreground text-sm">
          Kampanya ilerlemen ve bu ayın planın bu harcamalarla güncellendi.
        </p>
        <div className="flex gap-3">
          <Button asChild>
            <Link href="/harcamalar">Harcamalara dön</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/plan">Planı gör</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!review) {
    return (
      <form
        aria-label="Ekstre yükle"
        className="space-y-4 rounded-xl border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setError(undefined);
          startTransition(async () => {
            const response = await fetch("/api/me/statements/parse", {
              method: "POST",
              body: form,
            });
            const body = (await response.json().catch(() => ({}))) as
              StatementReview | { error?: string; code?: string };
            if (!response.ok || !("rows" in body)) {
              const failure = body as { error?: string; code?: string };
              setNeedsPassword(
                failure.code === "password_required" || failure.code === "wrong_password",
              );
              setError(failure.error ?? "Ekstre okunamadı.");
              return;
            }
            setReview({
              ...body,
              rows: body.rows.map((row) => ({
                ...row,
                selected: !row.duplicate && !row.outOfRange,
              })),
            });
          });
        }}
      >
        <label className="block space-y-1 text-sm">
          <span className="block font-medium">Ekstre hangi kartın?</span>
          <select
            name="userCardId"
            value={card}
            onChange={(e) => setCard(e.target.value)}
            className={fieldClass}
          >
            {cards.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="block font-medium">Ekstre PDF&apos;i (en fazla 4 MB)</span>
          <input
            type="file"
            name="file"
            accept="application/pdf,.pdf"
            required
            className="block text-sm"
          />
        </label>
        {needsPassword && (
          <label className="block space-y-1 text-sm">
            <span className="block font-medium">PDF parolası</span>
            <input type="password" name="password" autoComplete="off" className={fieldClass} />
            <span className="text-muted-foreground block text-xs">
              Parola yalnızca dosyayı açmak için kullanılır, saklanmaz.
            </span>
          </label>
        )}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Okunuyor…" : "Ekstreyi oku"}
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {review.rows.length} harcama satırı bulundu
        {review.skippedCredits > 0 && ` · ${review.skippedCredits} ödeme/iade satırı atlandı`}
        {review.unparsedLines > 0 && ` · ${review.unparsedLines} satır okunamadı`}. Eklemek
        istediklerini seç ve kategorilerini kontrol et.
      </p>
      {review.rows.length === 0 ? (
        <p className="rounded-xl border p-4 text-sm">
          Bu ekstrede harcama satırı tanınamadı. Bankanın biçimi henüz desteklenmiyor olabilir;
          harcamalarını elle ekleyebilirsin.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm" aria-label="Ekstre satırları">
            <thead className="text-muted-foreground text-left">
              <tr>
                <th className="px-3 py-2 font-normal">
                  <span className="sr-only">Seç</span>
                </th>
                <th className="px-3 py-2 font-normal">Tarih</th>
                <th className="px-3 py-2 font-normal">Açıklama</th>
                <th className="px-3 py-2 text-right font-normal">Tutar</th>
                <th className="px-3 py-2 font-normal">Kategori</th>
              </tr>
            </thead>
            <tbody>
              {review.rows.map((row, index) => (
                <tr key={index} className={cn("border-t", !row.selected && "opacity-60")}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      disabled={row.outOfRange}
                      onChange={(e) => update(index, { selected: e.target.checked })}
                      aria-label={`${row.description} satırını ekle`}
                      className="accent-primary size-4"
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {dayFormat.format(new Date(`${row.date}T00:00:00Z`))}
                  </td>
                  <td className="px-3 py-2">
                    {row.description}
                    {row.installment && (
                      <span className="text-muted-foreground"> · taksit {row.installment}</span>
                    )}
                    {row.duplicate && (
                      <span className="block text-xs text-amber-700 dark:text-amber-400">
                        Zaten girilmiş olabilir
                      </span>
                    )}
                    {row.outOfRange && (
                      <span className="text-muted-foreground block text-xs">
                        Son 90 günün dışında
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {formatKurus(row.amountKurus)}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={row.categoryId ?? ""}
                      onChange={(e) =>
                        update(index, { categoryId: e.target.value || null, merchantId: null })
                      }
                      aria-label={`${row.description} kategorisi`}
                      className={cn(
                        fieldClass,
                        row.selected && !row.categoryId && "border-red-500",
                      )}
                    >
                      <option value="">Kategori seç</option>
                      {categories.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {missingCategory && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Seçili satırların hepsine kategori seç.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={pending || selected.length === 0 || missingCategory}
          onClick={() =>
            startTransition(async () => {
              setError(undefined);
              const response = await fetch("/api/me/statements/import", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  userCardId: card,
                  rows: selected.map((row) => ({
                    date: row.date,
                    amountKurus: row.amountKurus,
                    categoryId: row.categoryId,
                    merchantId: row.merchantId,
                  })),
                }),
              });
              const body = (await response.json().catch(() => ({}))) as {
                imported?: number;
                error?: string;
              };
              if (!response.ok || body.imported === undefined) {
                setError(body.error ?? "Eklenemedi.");
                return;
              }
              setImported(body.imported);
              router.refresh();
            })
          }
        >
          Seçilenleri ekle ({selected.length})
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => setReview(null)}>
          Başka ekstre yükle
        </Button>
      </div>
    </div>
  );
}
