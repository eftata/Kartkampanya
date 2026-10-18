import type { Metadata } from "next";
import { Suspense } from "react";

import { FeedbackForm } from "@/components/feedback-form";
import { requireUser } from "@/lib/auth/session";
import { getMyFeedback } from "@/lib/feedback";
import { FEEDBACK_KIND_LABELS, FEEDBACK_STATUS_FOR_USER } from "@/lib/feedback-labels";

export const metadata: Metadata = { title: "Geri bildirim" };

const dateFormat = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeZone: "Europe/Istanbul",
});

/** `?sayfa=/plan`: geri bildirim hangi sayfadan açıldı (yalnızca site içi yol). */
function pageFrom(value: string | string[] | undefined): string | null {
  const page = Array.isArray(value) ? value[0] : value;
  return page && /^\/[^\s/][^\s]{0,198}$|^\/$/.test(page) ? page.split(/[?#]/)[0]! : null;
}

async function FeedbackContent({ searchParams }: PageProps<"/geri-bildirim">) {
  const user = await requireUser();
  const page = pageFrom((await searchParams).sayfa);
  const mine = await getMyFeedback(user.id);
  return (
    <div className="space-y-8">
      <div className="rounded-xl border p-4">
        <FeedbackForm page={page} />
      </div>
      {mine.length > 0 && (
        <section aria-label="Gönderdiklerin" className="space-y-3">
          <h2 className="font-medium">Gönderdiklerin</h2>
          <ul className="space-y-2">
            {mine.map((item) => (
              <li key={item.id} className="space-y-1 rounded-lg border p-3 text-sm">
                <p className="text-muted-foreground flex flex-wrap justify-between gap-2 text-xs">
                  <span>
                    {FEEDBACK_KIND_LABELS[item.kind]} ·{" "}
                    {dateFormat.format(new Date(item.createdAt))}
                  </span>
                  <span>{FEEDBACK_STATUS_FOR_USER[item.status]}</span>
                </p>
                <p className="line-clamp-3 whitespace-pre-wrap">{item.message}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function FeedbackPage(props: PageProps<"/geri-bildirim">) {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Geri bildirim</h1>
        <p className="text-muted-foreground">
          KartPlan kapalı betada. Bir hata, eksik ya da yanlış bir kampanya gördüysen ya da aklına
          bir fikir geldiyse yaz; her mesajı okuyoruz.
        </p>
      </div>
      <Suspense fallback={<div className="bg-muted h-64 animate-pulse rounded-xl" />}>
        <FeedbackContent {...props} />
      </Suspense>
    </div>
  );
}
