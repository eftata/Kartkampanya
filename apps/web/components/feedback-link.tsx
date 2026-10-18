"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const className =
  "text-muted-foreground hover:text-foreground rounded-md border px-2 py-1 text-xs whitespace-nowrap";

/** Üst menüdeki "Geri bildirim": açıldığı sayfayı forma iletir (yalnızca yol). */
export function FeedbackLink() {
  const pathname = usePathname();
  const href =
    pathname === "/geri-bildirim"
      ? "/geri-bildirim"
      : `/geri-bildirim?sayfa=${encodeURIComponent(pathname)}`;
  return (
    <Link href={href} className={className}>
      Geri bildirim
    </Link>
  );
}

export function FeedbackLinkFallback() {
  return (
    <Link href="/geri-bildirim" className={className}>
      Geri bildirim
    </Link>
  );
}
