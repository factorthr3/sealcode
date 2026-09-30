'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavItem {
  href: string;
  label: string;
}

export function DashboardNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Dashboard"
      className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
    >
      {items.map((item) => {
        const active = item.href === '/app' ? pathname === '/app' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`shrink-0 rounded-md px-3 py-2 text-sm transition-colors ${
              active
                ? 'bg-surface font-medium text-ink shadow-sm ring-1 ring-line'
                : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
