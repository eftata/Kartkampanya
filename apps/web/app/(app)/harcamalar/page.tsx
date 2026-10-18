import { formatKurus } from "@kartplan/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { DeleteTransactionButton } from "@/components/delete-transaction-button";
import { ProgressBar } from "@/components/progress-bar";
import { TransactionForm } from "@/components/transaction-form";
import { requireUser } from "@/lib/auth/session";
import { turkeyToday } from "@/lib/campaign-match";
import { monthLabel } from "@/lib/plan-request";
import { getSpendCategories } from "@/lib/spend-profile";
import { earliestTransactionDay, listTransactions, monthSpendSummary } from "@/lib/transactions";
import { listUserCards } from "@/lib/user-cards";

export const metadata: Metadata = { title: "Harcamalar" };

const dayFormat = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

async function TransactionsContent() {
  const user = await requireUser();
  const today = turkeyToday();
  const month = today.slice(0, 7);
  const [cards, categories, transactions, summary] = await Promise.all([
    listUserCards(user.id),
    getSpendCategories(),
    listTransactions(user.id, month),
    monthSpendSummary(user.id, month),
  ]);
  if (cards.length === 0) redirect("/baslangic");

  return (
    <div className="space-y-8">
      <section aria-label="Yeni harcama" className="rounded-xl border p-4">
        <TransactionForm
          cards={cards.map((card) => ({ id: card.id, name: card.nickname || card.cardName }))}
          categories={categories}
          today={today}
          earliest={earliestTransactionDay(today)}
        />
      </section>

      {summary.length > 0 && (
        <section aria-label="Bu ay kategori bazında" className="space-y-3">
          <h2 className="font-medium">{monthLabel(month)}: plana göre harcaman</h2>
          <ul className="space-y-3">
            {summary.map((row) => (
              <li key={row.categoryId} className="space-y-1">
                <p className="flex justify-between gap-2 text-sm">
                  <span>{row.categoryName}</span>
                  <span className="text-muted-foreground">
                    {formatKurus(row.spentKurus)} /{" "}
                    {row.plannedKurus > 0 ? formatKurus(row.plannedKurus) : "planda yok"}
                  </span>
                </p>
                <ProgressBar
                  label={`${row.categoryName} harcaması`}
                  value={row.plannedKurus > 0 ? row.spentKurus / row.plannedKurus : 1}
                  tone={row.spentKurus > row.plannedKurus ? "over" : "default"}
                />
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            Planın, bu ay girdiğin harcamalar düşülerek ayın kalanı için hesaplanır.{" "}
            <Link href="/plan" className="underline">
              Planı gör
            </Link>
          </p>
        </section>
      )}

      <section aria-label="Bu ayın harcamaları" className="space-y-3">
        <h2 className="font-medium">Bu ayın harcamaları</h2>
        {transactions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Henüz harcama girmedin. Kart ekstresini beklemeden kampanya eşiklerine ne kadar
            yaklaştığını görmek için harcamalarını ekle.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-left">
                <tr>
                  <th className="px-3 py-2 font-normal">Tarih</th>
                  <th className="px-3 py-2 font-normal">Kart</th>
                  <th className="px-3 py-2 font-normal">Kategori</th>
                  <th className="px-3 py-2 text-right font-normal">Tutar</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">İşlem</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((item) => {
                  const label = `${dayFormat.format(new Date(`${item.date}T00:00:00Z`))} ${item.categoryName} ${formatKurus(item.amountKurus)}`;
                  return (
                    <tr key={item.id} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {dayFormat.format(new Date(`${item.date}T00:00:00Z`))}
                      </td>
                      <td className="px-3 py-2">{item.cardName}</td>
                      <td className="px-3 py-2">
                        {item.categoryName}
                        {item.merchantName && (
                          <span className="text-muted-foreground"> · {item.merchantName}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {formatKurus(item.amountKurus)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <DeleteTransactionButton id={item.id} label={label} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Harcamalar</h1>
        <p className="text-muted-foreground">
          Yaptığın harcamaları gir; kampanya eşiklerine ne kadar kaldığını görelim ve planını ayın
          kalanına göre güncelleyelim. Kart numarası ya da ekstre bilgisi istemeyiz.
        </p>
      </div>
      <Suspense fallback={<div className="bg-muted h-64 animate-pulse rounded-xl" />}>
        <TransactionsContent />
      </Suspense>
    </div>
  );
}
