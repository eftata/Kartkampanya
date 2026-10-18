"use client";

import { parseTlInput } from "@kartplan/shared";
import type { SpendCategory } from "@kartplan/shared";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { addTransactionAction } from "@/lib/transaction-actions";

const fieldClass =
  "border-input focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px]";

/**
 * Harcama ekleme. Başarıdan sonra tutar temizlenir, kart/kategori/tarih kalır (art arda giriş
 * kolay olsun). Hata alınca girilenler korunur.
 */
export function TransactionForm({
  cards,
  categories,
  today,
  earliest,
}: {
  cards: { id: string; name: string }[];
  categories: SpendCategory[];
  today: string;
  earliest: string;
}) {
  const [card, setCard] = useState(cards[0]?.id ?? "");
  const [category, setCategory] = useState(categories[0]?.id ?? "");
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [state, setState] = useState<{ ok?: boolean; error?: string }>({});
  const [pending, startTransition] = useTransition();
  const merchants = categories.find((item) => item.id === category)?.merchants ?? [];

  return (
    <form
      aria-label="Harcama ekle"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        const amountKurus = parseTlInput(amount);
        if (!amountKurus) {
          setState({ error: "Tutarı TL olarak yaz (ör. 450 ya da 1.250,50)." });
          return;
        }
        startTransition(async () => {
          const result = await addTransactionAction({
            userCardId: card,
            categoryId: category,
            merchantId: merchant || null,
            amountKurus,
            date,
          });
          setState(result);
          if (result.ok) setAmount("");
        });
      }}
    >
      <label className="space-y-1 text-sm">
        <span className="block font-medium">Kart</span>
        <select value={card} onChange={(e) => setCard(e.target.value)} className={fieldClass}>
          {cards.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="block font-medium">Kategori</span>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setMerchant("");
          }}
          className={fieldClass}
        >
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="block font-medium">
          Marka <span className="text-muted-foreground font-normal">(isteğe bağlı)</span>
        </span>
        <select
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          className={fieldClass}
        >
          <option value="">Belirtme</option>
          {merchants.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="block font-medium">Tutar (TL)</span>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="450"
          required
          className={fieldClass}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="block font-medium">Tarih</span>
        <input
          type="date"
          value={date}
          min={earliest}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          required
          className={fieldClass}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-5">
        <Button type="submit" disabled={pending}>
          Harcamayı ekle
        </Button>
        {state.error && (
          <p role="alert" className="text-destructive text-sm">
            {state.error}
          </p>
        )}
        {state.ok && (
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
            Eklendi; planın ayın kalanına göre güncellenecek.
          </p>
        )}
      </div>
    </form>
  );
}
