import Link from "next/link";

import { NavLinks } from "@/components/nav-links";
import { Button } from "@/components/ui/button";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Link href="/" className="font-semibold">
            KartPlan
          </Link>
          <div className="flex items-center gap-2">
            <NavLinks items={[{ href: "/kampanyalar", label: "Kampanyalar" }]} />
            <Button asChild size="sm">
              <Link href="/plan">Giriş yap</Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</main>
      <footer className="text-muted-foreground border-t py-6 text-center text-xs">
        KartPlan · Kart numarası, CVV veya son kullanma tarihi asla istemeyiz.
      </footer>
    </>
  );
}
