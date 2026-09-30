import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Badge } from '@/components/ui';
import { requireStaff } from '@/lib/session';

export const metadata = {
  title: { template: '%s · Sealcode staff', default: 'Sealcode staff' },
  robots: { index: false },
};

export default async function StaffLayout({ children }: LayoutProps<'/staff'>) {
  const s = await requireStaff();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-8">
          <div className="flex items-center gap-3">
            <Link href="/staff" aria-label="Staff console">
              <Logo />
            </Link>
            <Badge tone="seal">Staff</Badge>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-muted sm:inline">{s.user.email}</span>
            <Link href="/app" className="text-seal hover:underline">
              Dashboard →
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
