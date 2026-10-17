import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ConsentForm } from "@/components/consent-form";
import { DeleteAccountForm } from "@/components/delete-account-form";
import { getCurrentUser } from "@/lib/auth/session";
import { hasCurrentConsent } from "@/lib/consent";
import { ACIK_RIZA_METNI, PAZARLAMA_METNI } from "@/lib/legal";

export const metadata: Metadata = { title: "Onay", robots: { index: false, follow: false } };

async function Consent() {
  // requireUser burada kullanılmaz: o, onay yoksa buraya yönlendirir.
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (await hasCurrentConsent(user.id)) redirect("/plan");
  return (
    <div className="space-y-8">
      <ConsentForm texts={{ acikRiza: ACIK_RIZA_METNI, pazarlama: PAZARLAMA_METNI }} />
      <details className="text-sm">
        <summary className="text-muted-foreground cursor-pointer">Onaylamak istemiyorum</summary>
        <div className="mt-3 space-y-3 rounded-lg border p-4">
          <p>
            Açık rıza olmadan hizmeti sunamıyoruz. İstersen hesabını ve verilerini silebilirsin; ya
            da şimdilik çıkış yapıp daha sonra karar verebilirsin.
          </p>
          <DeleteAccountForm email={user.email} />
        </div>
      </details>
    </div>
  );
}

export default function ConsentPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Kişisel verilerin</h1>
      <p className="text-muted-foreground text-sm">
        Devam etmeden önce verilerini nasıl işlediğimizi oku ve onayla. Kart numarası, CVV ya da
        şifre asla istemeyiz.
      </p>
      <Suspense fallback={<div className="bg-muted h-48 animate-pulse rounded-xl" />}>
        <Consent />
      </Suspense>
    </div>
  );
}
