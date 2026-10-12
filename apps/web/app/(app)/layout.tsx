import Link from "next/link";

import { NavLinks } from "@/components/nav-links";

const items = [
  { href: "/plan", label: "Bu ayın planı" },
  { href: "/kampanyalarim", label: "Kampanyalar" },
  { href: "/kartlarim", label: "Kartlarım" },
  { href: "/profil", label: "Profilim" },
];

// Giriş zorunluluğu Sprint 0 / Kimlik oturumunda (Auth.js) eklenecek.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Link href="/plan" className="font-semibold">
            KartPlan
          </Link>
          <NavLinks items={items} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
