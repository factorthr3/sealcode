'use server';

import { redirect } from 'next/navigation';
import { acc } from '@/lib/db';
import { requireUser } from '@/lib/session';

export async function approveDevice(code: string, form: FormData): Promise<void> {
  const s = await requireUser(`/device?code=${encodeURIComponent(code)}`);
  const orgId = String(form.get('orgId') ?? '');
  if (!s.orgs.some((o) => o.id === orgId && o.role !== 'billing'))
    redirect(`/device?code=${encodeURIComponent(code)}&error=org`);
  const ok = await acc().approveDeviceCode(code, s.user.id, orgId);
  redirect(ok ? '/device?done=approved' : `/device?code=${encodeURIComponent(code)}&error=expired`);
}

export async function denyDevice(code: string): Promise<void> {
  await requireUser('/device');
  await acc().denyDeviceCode(code);
  redirect('/device?done=denied');
}
