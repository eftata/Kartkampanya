import Link from "next/link";

import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string };

export function NavLinks({ items, className }: { items: NavItem[]; className?: string }) {
  return (
    <nav className={cn("flex items-center gap-1 text-sm", className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 rounded-md px-3 py-1.5 whitespace-nowrap transition-colors"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
