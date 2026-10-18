import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { StatementImport } from "@/components/statement-import";
import { requireUser } from "@/lib/auth/session";
import { getSpendCategories } from "@/lib/spend-profile";
import { listUserCards } from "@/lib/user-cards";

export const metadata: Metadata = { title: "Ekstreden harcama ekle" };

async function StatementContent() {
  const user = await requireUser();
  const [cards, categories] = await Promise.all([listUserCards(user.id), getSpendCategories()]);
  if (cards.length === 0) redirect("/baslangic");
  return (
    <StatementImport
      cards={cards.map((card) => ({ id: card.id, name: card.nickname || card.cardName }))}
      categories={categories.map(({ id, name }) => ({ id, name }))}
    />
  );
}

export default function StatementPage() {
  return (
    <div className="max-w-4xl space-y-4">
      <div className="space-y-1">
        <Link href="/harcamalar" className="text-muted-foreground text-sm underline">
          ← Harcamalar
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Ekstreden harcama ekle</h1>
        <p className="text-muted-foreground">
          Bankanın internet şubesinden indirdiğin kredi kartı ekstresini (PDF) yükle; harcama
          satırlarını çıkaralım, sen onayla.
        </p>
        <p className="text-muted-foreground text-xs">
          PDF&apos;in ve içindeki bilgiler (ad, adres, kart numarası, açıklamalar) saklanmaz;
          yalnızca onayladığın satırların tarihi, tutarı ve kategorisi harcama olarak kaydedilir.
        </p>
      </div>
      <Suspense fallback={<div className="bg-muted h-48 animate-pulse rounded-xl" />}>
        <StatementContent />
      </Suspense>
    </div>
  );
}
