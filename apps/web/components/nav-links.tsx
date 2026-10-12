import Link from "next/link";

export type NavItem = { href: string; label: string };

export function NavLinks({ items }: { items: NavItem[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md px-3 py-1.5 transition-colors"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
