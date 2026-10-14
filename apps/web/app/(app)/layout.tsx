import Link from "next/link";
import { Suspense } from "react";

import { NavLinks } from "@/components/nav-links";
import { UserMenu } from "@/components/user-menu";

const items = [
  { href: "/plan", label: "Bu ayın planı" },
  { href: "/kampanyalarim", label: "Kampanyalar" },
  { href: "/kartlarim", label: "Kartlarım" },
  { href: "/profil", label: "Profilim" },
];

// Giriş kontrolü: proxy.ts (iyimser, çerez) + UserMenu içindeki requireUser() (gerçek doğrulama).
// Kullanıcıya özel veri okuyan sayfalar da kendi içlerinde requireUser() çağırmalıdır.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-4">
            <Link href="/plan" className="font-semibold">
              KartPlan
            </Link>
            <NavLinks items={items} className="hidden md:flex" />
          </div>
          <Suspense fallback={<div className="bg-muted h-8 w-24 animate-pulse rounded-md" />}>
            <UserMenu />
          </Suspense>
        </div>
        {/* Küçük ekranlarda menü ayrı, yatay kaydırılabilir satırda. */}
        <NavLinks items={items} className="overflow-x-auto border-t px-2 py-1 md:hidden" />
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
