import { formatKurus, parseTlInput } from "@kartplan/shared";
import type { PurchaseAdviceDto } from "@kartplan/shared";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { turkeyToday } from "@/lib/campaign-match";
import { getPurchaseAdvice } from "@/lib/purchase-advice";
import { getSpendCategories } from "@/lib/spend-profile";
import { countUserCards } from "@/lib/user-cards";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Hangi kartla ödemeliyim?" };

const fieldClass =
  "border-input focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px]";

const dayFormat = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

function Results({ advice }: { advice: PurchaseAdviceDto }) {
  const best = advice.cards[0];
  return (
    <section aria-label="Sonuç" className="space-y-3">
      {best && best.totalKurus > 0 && !best.overLimit && (
        <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm">
          <strong>{best.name}</strong> ile öde: ~{formatKurus(best.totalKurus)} kazanırsın.
        </p>
      )}
      <ol className="space-y-3">
        {advice.cards.map((card, index) => (
          <li
            key={card.cardId}
            aria-label={card.name}
            className={cn(
              "space-y-2 rounded-xl border p-4",
              index === 0 && "border-emerald-500/60",
            )}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">{card.name}</p>
              <p className="text-lg font-semibold">~{formatKurus(card.totalKurus)}</p>
            </div>
            <ul className="text-muted-foreground space-y-0.5 text-sm">
              <li>Kart puanı/iadesi: ~{formatKurus(card.baseKurus)}</li>
              {card.campaigns.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/kampanyalarim/${item.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {item.title}
                  </Link>
                  : +{formatKurus(item.gainKurus)}
                </li>
              ))}
              {card.ifJoined.map((item) => (
                <li key={item.id} className="text-amber-800 dark:text-amber-300">
                  <Link href={`/kampanyalarim/${item.id}`} className="underline">
                    {item.title}
                  </Link>
                  : katılırsan +{formatKurus(item.gainKurus)}
                  {item.joinDeadline &&
                    ` (son katılım ${dayFormat.format(new Date(`${item.joinDeadline}T00:00:00Z`))})`}
                </li>
              ))}
              {card.installments.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/kampanyalarim/${item.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {item.title}
                  </Link>
                  : ek taksit
                </li>
              ))}
              {card.overLimit && (
                <li className="text-red-700 dark:text-red-400">
                  Bu ay kalan limitin bu alışverişe yetmiyor.
                </li>
              )}
            </ul>
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground text-xs">
        Hesap, bu ay girdiğin harcamalar ve katıldığın kampanyalarla yapılır: eşiğini zaten geçtiğin
        kampanya ek kazanç göstermez. Kesin koşullar bankanın sayfasındadır.
        {advice.unverifiedRates && " Bazı kartlarının temel oranları henüz doğrulanmadı."}
      </p>
    </section>
  );
}

async function Calculator({ searchParams }: PageProps<"/hesapla">) {
  const user = await requireUser();
  if ((await countUserCards(user.id)) === 0) redirect("/baslangic");
  const params = await searchParams;
  const today = turkeyToday();
  const values = {
    tutar: first(params.tutar),
    kategori: first(params.kategori),
    marka: first(params.marka),
    tarih: first(params.tarih) || today,
  };
  const categories = await getSpendCategories();

  let advice: PurchaseAdviceDto | null = null;
  let error: string | null = null;
  if (values.tutar || values.kategori) {
    const amountKurus = parseTlInput(values.tutar);
    if (!amountKurus) error = "Tutarı TL olarak yaz (ör. 4.000).";
    else if (!values.kategori) error = "Kategori seç.";
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(values.tarih)) error = "Tarihi seç.";
    else {
      const result = await getPurchaseAdvice(
        user.id,
        {
          amountKurus,
          categoryId: values.kategori,
          merchantId: values.marka || null,
          date: values.tarih,
        },
        today,
      );
      if (result.ok) advice = result.data;
      else error = result.error;
    }
  }

  return (
    <div className="space-y-6">
      <Form
        action="/hesapla"
        aria-label="Alışveriş"
        className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
      >
        <label className="space-y-1 text-sm">
          <span className="block font-medium">Tutar (TL)</span>
          <input
            name="tutar"
            inputMode="decimal"
            defaultValue={values.tutar}
            placeholder="4.000"
            required
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block font-medium">Kategori</span>
          <select name="kategori" defaultValue={values.kategori} required className={fieldClass}>
            <option value="">Seç</option>
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
          <select name="marka" defaultValue={values.marka} className={fieldClass}>
            <option value="">Belirtme</option>
            {categories.map((item) => (
              <optgroup key={item.id} label={item.name}>
                {item.merchants.map((merchant) => (
                  <option key={merchant.id} value={merchant.id}>
                    {merchant.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block font-medium">Ne zaman?</span>
          <input
            type="date"
            name="tarih"
            defaultValue={values.tarih}
            min={today}
            className={fieldClass}
          />
        </label>
        <Button type="submit">Hesapla</Button>
      </Form>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {advice && <Results advice={advice} />}
    </div>
  );
}

export default function CalculatorPage(props: PageProps<"/hesapla">) {
  return (
    <div className="max-w-3xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Hangi kartla ödemeliyim?</h1>
        <p className="text-muted-foreground">
          Yapacağın tek bir alışverişi yaz (ör. 4.000 TL telefon); kartlarının her biriyle ne
          kazanacağını karşılaştıralım. Hiçbir şey kaydedilmez.
        </p>
      </div>
      <Suspense fallback={<div className="bg-muted h-48 animate-pulse rounded-xl" />}>
        <Calculator {...props} />
      </Suspense>
    </div>
  );
}
