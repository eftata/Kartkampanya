import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SpendProfileForm } from "@/components/spend-profile-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getSpendCategories, getSpendProfile } from "@/lib/spend-profile";

export const metadata: Metadata = { title: "Profilim" };

async function Profile() {
  const user = await requireUser();
  const [categories, profile] = await Promise.all([getSpendCategories(), getSpendProfile(user.id)]);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <Card>
        <CardHeader>
          <CardTitle>Aylık harcamaların</CardTitle>
          <CardDescription>
            Plan bu bütçeyi kartlarına dağıtır. Harcamaların değiştikçe güncelle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SpendProfileForm categories={categories} initial={profile} submitLabel="Kaydet" />
        </CardContent>
      </Card>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Hesap</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="text-muted-foreground">E-posta</div>
            <div className="font-medium break-all">{user.email}</div>
          </div>
          <p className="text-muted-foreground">
            Kartlarını{" "}
            <Link href="/kartlarim" className="underline">
              Kartlarım
            </Link>{" "}
            sayfasından yönetebilirsin. Bildirim tercihleri, veri indirme ve hesap silme yakında
            burada olacak.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Profilim</h1>
      <Suspense fallback={<div className="bg-muted h-64 animate-pulse rounded-xl" />}>
        <Profile />
      </Suspense>
    </div>
  );
}
