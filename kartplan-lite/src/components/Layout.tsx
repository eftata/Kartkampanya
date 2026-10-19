import { type ReactNode } from "react";
import { Link, usePath } from "../lib/router";
import { useApp } from "../lib/store";

const NAV = [
  { href: "/plan", label: "Plan", icon: "◎" },
  { href: "/kampanyalar", label: "Kampanyalar", icon: "✦" },
  { href: "/hesapla", label: "Hesapla", icon: "±" },
  { href: "/kartlarim", label: "Kartlarım", icon: "▭" },
  { href: "/harcama", label: "Harcamam", icon: "◑" },
];

export function Layout({ children }: { children: ReactNode }) {
  const { path } = usePath();
  const { admin, user, error } = useApp();
  const initial = (user?.displayName || user?.email || "?").slice(0, 1).toLocaleUpperCase("tr");
  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/plan" className="wordmark" aria-label="KartPlan ana sayfa">
          Kart<em>Plan</em>
        </Link>
        <nav className="topnav" aria-label="Ana menü">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={path === n.href ? "active" : undefined}>
              {n.label}
            </Link>
          ))}
          {admin && (
            <Link href="/admin" className={path === "/admin" ? "active" : undefined}>
              Yönetim
            </Link>
          )}
        </nav>
        <Link
          href="/profil"
          className={`avatar ${path === "/profil" ? "active" : ""}`}
          aria-label="Profil"
        >
          {initial}
        </Link>
      </header>
      {error && (
        <div className="banner banner-warn" role="alert">
          Veriye ulaşılamadı: {error}
        </div>
      )}
      <main className="page">{children}</main>
      <nav className="tabbar" aria-label="Alt menü">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={path === n.href ? "active" : undefined}>
            <span aria-hidden="true">{n.icon}</span>
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageHead({
  kicker,
  title,
  children,
}: {
  kicker?: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="pagehead">
      {kicker && <p className="kicker">{kicker}</p>}
      <h1>{title}</h1>
      {children && <div className="pagehead-sub">{children}</div>}
    </div>
  );
}
