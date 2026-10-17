import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";

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
  );
}
