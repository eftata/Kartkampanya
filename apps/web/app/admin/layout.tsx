import Link from "next/link";

import { NavLinks } from "@/components/nav-links";

const items = [
  { href: "/admin/kampanyalar", label: "Onay kuyruğu" },
  { href: "/admin/katalog", label: "Katalog" },
];

// role = ADMIN kontrolü Sprint 1'de (rol tabanlı erişim) eklenecek.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <header className="bg-muted/40 border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/admin" className="font-semibold">
            KartPlan <span className="text-muted-foreground font-normal">· Admin</span>
          </Link>
          <NavLinks items={items} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
