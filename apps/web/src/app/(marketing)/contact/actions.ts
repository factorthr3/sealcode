'use server';

import { z } from 'zod';
import { PAID_PLAN_IDS } from '@sealcode/shared';
import { acc } from '@/lib/db';
import { trySendEmail } from '@/lib/email';
import { env } from '@/lib/env';
import { allow, clientKey } from '@/lib/rate-limit';
import { getSession } from '@/lib/session';
import { REASONS, TEAM_SIZES } from './options';

export interface ContactState {
  error?: string | null;
  fieldErrors?: Record<string, string>;
  sent?: boolean;
}

const schema = z.object({
  name: z.string().trim().min(1, 'Tell us your name.').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid work email.').max(254),
  company: z.string().trim().min(1, 'Which company is this for?').max(160),
  teamSize: z.enum(TEAM_SIZES),
  plan: z
    .string()
    .refine((v) => v === 'unsure' || (PAID_PLAN_IDS as string[]).includes(v), 'Choose a plan.'),
  reason: z.enum(Object.keys(REASONS) as [string, ...string[]]),
  seats: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number().int().min(1).max(100_000).optional(),
  ),
  message: z.string().trim().max(4_000).optional(),
});

export async function submitEnquiry(_prev: ContactState, form: FormData): Promise<ContactState> {
  // Bots fill every field; people never see this one.
  if (String(form.get('website') ?? '') !== '') return { sent: true };
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { error: 'Please check the highlighted fields.', fieldErrors };
  }
  const d = parsed.data;
  const ip = (await clientKey()) ?? 'shared';
  if (
    !allow(`contact:${d.email}`, 3, 3_600_000) ||
    !allow(`contact-ip:${ip}`, ip === 'shared' ? 200 : 10, 3_600_000)
  ) {
    return {
      error: 'We’ve received several messages from you already. We’ll be in touch shortly.',
    };
  }
  const session = await getSession();
  const orgId = session?.orgs.find((o) => o.id === session.session.activeOrgId)?.id ?? null;
  const enquiry = await acc().createEnquiry({
    name: d.name,
    email: d.email,
    company: d.company,
    teamSize: d.teamSize,
    planInterest: `${d.plan}:${d.reason}`,
    seats: d.seats ?? null,
    message: d.message ?? null,
    orgId,
    source: 'contact',
  });
  const e = env();
  await trySendEmail({
    to: e.SALES_INBOX,
    subject: `[${REASONS[d.reason as keyof typeof REASONS]}] ${d.company} (${d.teamSize} engineers)`,
    text: [
      `From: ${d.name} <${d.email}>`,
      `Company: ${d.company}`,
      `Team size: ${d.teamSize}`,
      `Plan: ${d.plan}${d.seats ? `, ${d.seats} seats` : ''}`,
      `Reason: ${REASONS[d.reason as keyof typeof REASONS]}`,
      orgId ? `Signed-in org: ${e.PUBLIC_SITE_URL}/staff/orgs/${orgId}` : 'Not signed in',
      '',
      d.message ?? '',
      '',
      `Enquiry ${enquiry.id}: ${e.PUBLIC_SITE_URL}/staff`,
    ].join('\n'),
  });
  await trySendEmail({
    to: d.email,
    subject: 'Thanks for contacting Sealcode',
    text: `Hi ${d.name},\n\nThanks for getting in touch about Sealcode for ${d.company}. We reply within one working day.\n\nIn the meantime you can try Sealcode yourself in the live playground on our homepage: ${e.PUBLIC_SITE_URL}/#playground\n\nThe Sealcode team`,
  });
  return { sent: true };
}
