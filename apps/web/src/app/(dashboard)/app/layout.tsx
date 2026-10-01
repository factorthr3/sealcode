import Link from 'next/link';
import { formatTokens, planName } from '@sealcode/shared';
import { resolveOrgBudget } from '@sealcode/db/gateway-store';
import { DashboardNav, type NavItem } from '@/components/dashboard-nav';
import { SubmitButton } from '@/components/form-controls';
import { Logo } from '@/components/logo';
import { Badge } from '@/components/ui';
import { daysLeft } from '@/lib/format';
import { can, ROLE_LABELS } from '@/lib/permissions';
import { requireOrg } from '@/lib/session';
import { signOut, switchOrg } from '../../(auth)/actions';

export default async function DashboardLayout({ children }: LayoutProps<'/app'>) {
  const ctx = await requireOrg();
  const { org, role, user, orgs, repo } = ctx;
  const full = await repo.org();

  const items: NavItem[] = [
    { href: '/app', label: 'Overview' },
    { href: '/app/connect', label: 'Connect' },
    { href: '/app/keys', label: 'API keys' },
    ...(can(role, 'members.manage') ? [{ href: '/app/members', label: 'Members' }] : []),
    { href: '/app/usage', label: 'Usage' },
    ...(can(role, 'budgets.manage') ? [{ href: '/app/budgets', label: 'Budgets' }] : []),
    ...(can(role, 'audit.view') ? [{ href: '/app/audit', label: 'Audit log' }] : []),
    ...(can(role, 'billing.view') ? [{ href: '/app/billing', label: 'Billing' }] : []),
    { href: '/app/settings', label: 'Settings' },
  ];

  let trialBanner: React.ReactNode = null;
  if (full?.status === 'trial') {
    const used = await repo.trialUsage();
    const allowance = resolveOrgBudget('trial', full.seats, null) ?? 0;
    const left = daysLeft(full.trialEndsAt);
    trialBanner = (
      <div className="border-b border-seal/20 bg-seal-soft px-4 py-2 text-center text-sm text-ink sm:px-8">
        <strong className="font-semibold">Pilot</strong>: {left} {left === 1 ? 'day' : 'days'} left
        · {formatTokens(used)} of {formatTokens(allowance)} tokens used ·{' '}
        <Link
          href="/app/billing"
          className="font-medium text-seal underline-offset-2 hover:underline"
        >
          Talk to us about your plan
        </Link>
      </div>
    );
  } else if (full?.status === 'suspended') {
    trialBanner = (
      <div className="border-b border-danger/20 bg-danger-soft px-4 py-2 text-center text-sm text-danger">
        This organisation is suspended. API requests are refused. Contact support@sealcode.ai.
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      {trialBanner}
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8 lg:flex-row lg:gap-10">
        <aside className="lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:w-56 lg:shrink-0">
          <div className="flex items-center justify-between lg:block">
            <Link href="/app" aria-label="Dashboard home">
              <Logo />
            </Link>
          </div>
          <details className="group relative mt-5 mb-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{org.name}</span>
                <span className="block text-xs text-muted">
                  {planName(org.plan)} · {ROLE_LABELS[role]}
                </span>
              </span>
              <span aria-hidden className="text-muted group-open:rotate-180">
                ▾
              </span>
            </summary>
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-line bg-surface p-1 shadow-lg">
              {orgs.map((o) => (
                <form key={o.id} action={switchOrg.bind(null, o.id)}>
                  <button
                    className="w-full truncate rounded-md px-3 py-2 text-left text-sm hover:bg-surface-2"
                    aria-current={o.id === org.id}
                  >
                    {o.name} {o.id === org.id ? '✓' : ''}
                  </button>
                </form>
              ))}
              {user.isStaff ? (
                <Link
                  href="/staff"
                  className="block rounded-md px-3 py-2 text-sm text-muted hover:bg-surface-2"
                >
                  + New organisation (staff)
                </Link>
              ) : null}
            </div>
          </details>
          <DashboardNav items={items} />
          <div className="mt-6 hidden border-t border-line pt-4 text-xs text-muted lg:block">
            <p className="truncate">{user.email}</p>
            {user.isStaff ? (
              <Link href="/staff" className="mt-2 inline-flex">
                <Badge tone="seal">Staff console →</Badge>
              </Link>
            ) : null}
            <form action={signOut} className="mt-3">
              <SubmitButton variant="ghost" size="sm" className="-ml-3">
                Sign out
              </SubmitButton>
            </form>
          </div>
        </aside>
        <main className="min-w-0 flex-1 pb-16">{children}</main>
      </div>
    </div>
  );
}
