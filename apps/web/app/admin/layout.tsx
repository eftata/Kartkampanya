import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { NavLinks } from "@/components/nav-links";
import { UserMenu } from "@/components/user-menu";
import { requireAdmin } from "@/lib/auth/session";

// Admin sayfaları başlık taşımaz: statik iskelette admin bölümünün varlığı belli olmasın.
export const metadata: Metadata = { robots: { index: false, follow: false } };

const items = [
  { href: "/admin/kampanyalar", label: "Onay kuyruğu" },
  { href: "/admin/katalog", label: "Katalog" },
  { href: "/admin/geri-bildirim", label: "Geri bildirim" },
  { href: "/admin/durum", label: "Sistem durumu" },
];

/**
 * Yetki kapısı: başlık dahil admin arayüzünün tamamı ADMIN rolü doğrulandıktan sonra çizilir.
 * Admin olmayan kullanıcı genel 404 sayfasını görür (admin bölümünün varlığı belli olmaz).
 * Her admin server action'ı ve API ucu ayrıca kendi içinde requireAdmin / withAdmin çağırır.
 */
async function AdminShell({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <header className="bg-muted/40 border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/admin" className="font-semibold">
            KartPlan <span className="text-muted-foreground font-normal">· Admin</span>
          </Link>
          <div className="flex items-center gap-4">
            <NavLinks items={items} className="hidden md:flex" />
            <UserMenu />
          </div>
        </div>
        <NavLinks items={items} className="overflow-x-auto border-t px-2 py-1 md:hidden" />
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
