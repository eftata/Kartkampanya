import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { DeleteAccountForm } from "@/components/delete-account-form";
import { MarketingConsentToggle } from "@/components/marketing-consent-toggle";
import { NotificationPrefsForm } from "@/components/notification-prefs-form";
import { PushToggle } from "@/components/push-toggle";
import { SpendProfileForm } from "@/components/spend-profile-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getConsentStatus } from "@/lib/consent";
import { getNotificationPrefs } from "@/lib/notifications/prefs";
import { pushConfig } from "@/lib/push";
import { getSpendCategories, getSpendProfile } from "@/lib/spend-profile";

export const metadata: Metadata = { title: "Profilim" };

const consentDate = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeZone: "Europe/Istanbul",
});

async function Profile() {
  const user = await requireUser();
  const [categories, profile, prefs, consent] = await Promise.all([
    getSpendCategories(),
    getSpendProfile(user.id),
    getNotificationPrefs(user.id),
    getConsentStatus(user.id),
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
            <CardTitle>Bildirimler</CardTitle>
            <CardDescription>
              E-postayla; açtığın cihazlara anlık bildirim olarak da.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <NotificationPrefsForm initial={prefs} />
            <PushToggle publicKey={pushConfig()?.publicKey ?? null} />
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
              sayfasından yönetebilirsin.
            </p>
          </CardContent>
        </Card>
        <Card id="verilerim" className="h-fit">
          <CardHeader>
            <CardTitle>Verilerin ve gizlilik</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              <Link href="/aydinlatma" className="underline">
                Aydınlatma metni
              </Link>
              {consent.aydinlatma &&
                ` · onay: ${consentDate.format(consent.aydinlatma.at)} (sürüm ${consent.aydinlatma.version})`}
            </p>
            <MarketingConsentToggle
              granted={consent.pazarlama?.granted ?? false}
              text="Yeni özellik ve kampanya duyurularını e-postayla almak istiyorum."
            />
            <a href="/api/me/export" download className="block font-medium underline">
              Verilerimi indir (JSON)
            </a>
            <details>
              <summary className="text-destructive cursor-pointer">Hesabımı sil</summary>
              <div className="mt-3">
                <DeleteAccountForm email={user.email} />
              </div>
            </details>
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
