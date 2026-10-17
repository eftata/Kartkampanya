import type { Metadata } from "next";
import { Suspense } from "react";

import { UnsubscribeForm } from "@/components/unsubscribe-form";
import { UNSUBSCRIBE_TARGETS } from "@/lib/notifications/unsubscribe";
import type { UnsubscribeTarget } from "@/lib/notifications/unsubscribe";

export const metadata: Metadata = {
  title: "Bildirimleri kapat",
  robots: { index: false, follow: false },
};

const LABELS: Record<UnsubscribeTarget, string> = {
  joinReminder: "Katılım hatırlatma e-postaları",
  endingSoon: "“Kampanya bitmek üzere” e-postaları",
  weeklySummary: "Haftalık plan özeti",
  all: "Tüm bildirim e-postaları",
};

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

async function Unsubscribe({ searchParams }: PageProps<"/abonelik">) {
  const query = await searchParams;
  const params = { u: first(query.u), k: first(query.k), t: first(query.t) };
  const target = UNSUBSCRIBE_TARGETS.find((item) => item === params.k);
  if (!target || !params.u || !params.t) {
    return <p role="alert">Bu bağlantı geçersiz. E-postadaki bağlantıyı yeniden aç.</p>;
  }
  // GET ile kapatılmaz: e-posta tarayıcıları bağlantıları önceden açabilir; onay düğmesi gerekir.
  return <UnsubscribeForm params={params} label={LABELS[target]} />;
}

export default function UnsubscribePage(props: PageProps<"/abonelik">) {
  return (
    <div className="mx-auto max-w-md space-y-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Bildirimleri kapat</h1>
      <Suspense fallback={<div className="bg-muted h-24 animate-pulse rounded-xl" />}>
        <Unsubscribe {...props} />
      </Suspense>
    </div>
  );
}
