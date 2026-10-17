import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { NotificationPrefsForm } from "@/components/notification-prefs-form";
import { SpendProfileForm } from "@/components/spend-profile-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getNotificationPrefs } from "@/lib/notifications/prefs";
import { getSpendCategories, getSpendProfile } from "@/lib/spend-profile";

export const metadata: Metadata = { title: "Profilim" };

async function Profile() {
  const user = await requireUser();
  const [categories, profile, prefs] = await Promise.all([
    getSpendCategories(),
    getSpendProfile(user.id),
    getNotificationPrefs(user.id),
  ]);
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
      <div className="space-y-6">
        <Card id="bildirimler" className="h-fit">
          <CardHeader>
            <CardTitle>E-posta bildirimleri</CardTitle>
          </CardHeader>
          <CardContent>
            <NotificationPrefsForm initial={prefs} />
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
              sayfasından yönetebilirsin. Veri indirme ve hesap silme yakında burada olacak.
            </p>
          </CardContent>
        </Card>
      </div>
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
