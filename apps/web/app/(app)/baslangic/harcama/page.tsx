import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SpendProfileForm } from "@/components/spend-profile-form";
import { requireUser } from "@/lib/auth/session";
import { getSpendCategories, getSpendProfile } from "@/lib/spend-profile";
import { countUserCards } from "@/lib/user-cards";

export const metadata: Metadata = { title: "Harcamalarını gir" };

async function SpendStep() {
  const user = await requireUser();
  // Adım sırası: önce kartlar.
  if ((await countUserCards(user.id)) === 0) redirect("/baslangic");
  const [categories, profile] = await Promise.all([getSpendCategories(), getSpendProfile(user.id)]);
  return (
    <SpendProfileForm
      categories={categories}
      initial={profile}
      submitLabel="Kaydet ve planımı gör"
      redirectTo="/plan"
    />
  );
}

export default function OnboardingSpendPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <p className="text-muted-foreground text-sm">Adım 2 / 2</p>
        <h1 className="text-2xl font-semibold tracking-tight">Aylık harcamalarını gir</h1>
        <p className="text-muted-foreground">
          Yaklaşık tutarlar yeterli; plan bu bütçeyi kartlarına en kazançlı şekilde dağıtır. Daha
          sonra Profilim sayfasından değiştirebilirsin.
        </p>
        <Link href="/baslangic" className="text-sm underline">
          ← Kartlarına dön
        </Link>
      </div>
      <Suspense fallback={<div className="bg-muted h-64 animate-pulse rounded-xl" />}>
        <SpendStep />
      </Suspense>
    </div>
  );
}
