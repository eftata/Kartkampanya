import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <section className="flex flex-col items-start gap-6 py-12">
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
