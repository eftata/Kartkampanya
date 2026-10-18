import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const STEPS = [
  {
    title: "Kartlarını seç",
    text: "Banka ve kart adını listeden seç. Kart numarası, CVV ya da son kullanma tarihi istemeyiz.",
  },
  {
    title: "Aylık harcamanı gir",
    text: "Market, akaryakıt, e-ticaret… kategori başına ayda yaklaşık ne harcadığını yaz.",
  },
  {
    title: "Planını al",
    text: "Hangi harcamayı hangi kartla yapacağını, hangi kampanyalara katılacağını ve tahmini kazancını gör.",
  },
] as const;

const PROMISES = [
  {
    title: "Kart bilgisi yok",
    text: "Yalnızca kart ürününü bilmemiz yeterli; ödeme bilgisi hiçbir formda alınmaz.",
  },
  {
    title: "Kontrol edilmiş kampanyalar",
    text: "Bankaların sayfalarından derlenen kampanyalar yayından önce ekibimizce gözden geçirilir.",
  },
  {
    title: "Gereksiz harcamaya teşvik yok",
    text: "Plan zaten yapacağın harcamaları dağıtır; eşiğe yetişmek için fazladan harcatmaz.",
  },
  {
    title: "Verilerin senin",
    text: "Verilerini istediğin an indirebilir, hesabını tek adımda silebilirsin (KVKK).",
  },
] as const;

/** Hesap silindikten sonra (`/?hesap=silindi`) kısa bilgi. */
async function DeletedNotice({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { hesap } = await searchParams;
  if (hesap !== "silindi") return null;
  return (
    <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm">
      Hesabın kapatıldı. Verilerin 30 gün içinde kalıcı olarak silinecek.
    </p>
  );
}

export default function LandingPage({ searchParams }: PageProps<"/">) {
  return (
    <div className="space-y-16">
      <section className="flex flex-col items-start gap-6 py-12">
        <Suspense>
          <DeletedNotice searchParams={searchParams} />
        </Suspense>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Kart kampanyalarından her ay en çok kazanacağın planı al.
        </h1>
        <p className="text-muted-foreground max-w-xl text-lg">
          Kartlarını ve aylık harcamanı gir; hangi harcamayı hangi kartla yapacağını, hangi
          kampanyalara katılacağını ve ne kadar kazanacağını gösterelim.
        </p>
        <div className="flex gap-3">
          <Button asChild size="lg">
            <Link href="/giris">Planımı oluştur</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/kampanyalar">Kampanyalara göz at</Link>
          </Button>
        </div>
      </section>

      <section aria-labelledby="nasil" className="space-y-6">
        <h2 id="nasil" className="text-2xl font-semibold tracking-tight">
          Nasıl çalışır?
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="space-y-2 rounded-xl border p-4">
              <span className="bg-primary text-primary-foreground inline-flex size-7 items-center justify-center rounded-full text-sm font-semibold">
                {index + 1}
              </span>
              <h3 className="font-medium">{step.title}</h3>
              <p className="text-muted-foreground text-sm">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="neden" className="space-y-6">
        <h2 id="neden" className="text-2xl font-semibold tracking-tight">
          Neden güvenebilirsin?
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {PROMISES.map((item) => (
            <li key={item.title} className="space-y-1 rounded-xl border p-4">
              <h3 className="font-medium">{item.title}</h3>
              <p className="text-muted-foreground text-sm">{item.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-muted/40 flex flex-col items-start gap-4 rounded-xl border p-6">
        <h2 className="text-xl font-semibold tracking-tight">Bu ay hangi kartla ödemelisin?</h2>
        <p className="text-muted-foreground">Ücretsiz; birkaç dakikada ilk planın hazır.</p>
        <Button asChild>
          <Link href="/giris">Planımı oluştur</Link>
        </Button>
      </section>
    </div>
  );
}
