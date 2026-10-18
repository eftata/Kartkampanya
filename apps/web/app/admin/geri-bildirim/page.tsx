import type { FeedbackStatus } from "@kartplan/shared";
import Link from "next/link";
import { Suspense } from "react";

import { FeedbackStatusButtons } from "@/components/admin/feedback-status-buttons";
import { requireAdmin } from "@/lib/auth/session";
import { getFeedbackList } from "@/lib/feedback";
import { FEEDBACK_KIND_LABELS, FEEDBACK_STATUS_LABELS } from "@/lib/feedback-labels";
import { cn } from "@/lib/utils";

const TABS: { slug: string; status: FeedbackStatus }[] = [
  { slug: "yeni", status: "NEW" },
  { slug: "okunan", status: "READ" },
  { slug: "tamamlanan", status: "DONE" },
];

const timeFormat = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Istanbul",
});

async function FeedbackInbox({ searchParams }: PageProps<"/admin/geri-bildirim">) {
  await requireAdmin();
  const { durum } = await searchParams;
  const tab = TABS.find((item) => item.slug === durum) ?? TABS[0]!;
  const { items, counts } = await getFeedbackList(tab.status);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Geri bildirimler</h1>
        <p className="text-muted-foreground text-sm">
          Beta kullanıcılarının mesajları, yeniden eskiye. Yanıt vermek için e-postaya tıkla.
        </p>
      </div>
      <nav aria-label="Geri bildirim durumu" className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <Link
            key={item.slug}
            href={item.slug === "yeni" ? "/admin/geri-bildirim" : `?durum=${item.slug}`}
            aria-current={item === tab ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              item === tab ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {FEEDBACK_STATUS_LABELS[item.status]} ({counts[item.status] ?? 0})
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border p-6 text-sm">Bu durumda mesaj yok.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <article
                aria-label={`Geri bildirim ${item.id}`}
                className="space-y-2 rounded-xl border p-4"
              >
                <p className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  <span className="text-foreground font-medium">
                    {FEEDBACK_KIND_LABELS[item.kind]}
                  </span>
                  {item.rating !== null && <span>Puan: {item.rating}/5</span>}
                  {item.page && <span>Sayfa: {item.page}</span>}
                  <span>{timeFormat.format(new Date(item.createdAt))}</span>
                  <a href={`mailto:${item.email}`} className="underline">
                    {item.email}
                  </a>
                </p>
                <p className="text-sm whitespace-pre-wrap">{item.message}</p>
                <FeedbackStatusButtons id={item.id} status={item.status} />
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminFeedbackPage(props: PageProps<"/admin/geri-bildirim">) {
  return (
    <Suspense fallback={<div className="bg-muted h-64 animate-pulse rounded-xl" />}>
      <FeedbackInbox {...props} />
    </Suspense>
  );
}
