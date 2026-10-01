'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { PAID_PLAN_IDS, PLANS, type PaidPlanId } from '@sealcode/shared';
import { acc } from '@/lib/db';
import { trySendEmail } from '@/lib/email';
import { env } from '@/lib/env';
import { requireStaff } from '@/lib/session';

export interface StaffState {
  error?: string | null;
  ok?: string | null;
}

const activation = z.object({
  plan: z.enum(PAID_PLAN_IDS as [PaidPlanId, ...PaidPlanId[]]),
  seats: z.coerce.number().int().min(1).max(100_000),
  interval: z.enum(['monthly', 'annual']),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  notes: z.string().trim().max(2_000).optional(),
});

/** Contact-us billing: record the agreement and move the org onto its paid plan. */
export async function activateOrg(
  orgId: string,
  _prev: StaffState,
  form: FormData,
): Promise<StaffState> {
  const staff = await requireStaff();
  const input = activation.safeParse(Object.fromEntries(form));
  if (!input.success) return { error: 'Check the plan, seats and dates.' };
  const d = input.data;
  if (d.seats < PLANS[d.plan].minSeats)
    return { error: `${PLANS[d.plan].name} has a ${PLANS[d.plan].minSeats}-seat minimum.` };
  const org = await acc().staffActivateOrg({
    orgId,
    plan: d.plan,
    seats: d.seats,
    interval: d.interval,
    startsOn: d.startsOn,
    endsOn: d.endsOn || null,
    notes: d.notes || null,
    staffId: staff.user.id,
  });
  if (!org) return { error: 'Organisation not found.' };
  for (const to of await acc().orgAdminEmails(orgId)) {
    await trySendEmail({
      to,
      subject: `${org.name} is now on Sealcode ${PLANS[d.plan].name}`,
      text: `Your Sealcode organisation ${org.name} has been activated on the ${PLANS[d.plan].name} plan with ${d.seats} seats, billed ${d.interval}.\n\nPilot limits no longer apply, and your keys, members and audit history carry over. Budgets are now in soft-alert mode; you can switch to a hard stop at ${env().PUBLIC_SITE_URL}/app/budgets.\n\nThank you for choosing Sealcode.`,
    });
  }
  revalidatePath('/staff');
  revalidatePath(`/staff/orgs/${orgId}`);
  return {
    ok: `Activated on ${PLANS[d.plan].name} with ${d.seats} seats. Owners and admins were emailed.`,
  };
}

export async function extendTrial(orgId: string, form: FormData): Promise<void> {
  const staff = await requireStaff();
  const days = z.coerce.number().int().min(1).max(90).safeParse(form.get('days'));
  if (!days.success) return;
  await acc().staffExtendTrial(orgId, days.data, staff.user.id);
  revalidatePath(`/staff/orgs/${orgId}`);
}

export async function setOrgStatus(orgId: string, status: 'active' | 'suspended'): Promise<void> {
  const staff = await requireStaff();
  await acc().staffSetStatus(orgId, status, staff.user.id);
  revalidatePath(`/staff/orgs/${orgId}`);
}

export async function setEnquiryStatus(id: string, form: FormData): Promise<void> {
  const staff = await requireStaff();
  const status = z.enum(['new', 'contacted', 'won', 'lost']).safeParse(form.get('status'));
  if (!status.success) return;
  await acc().staffSetEnquiryStatus(id, status.data, staff.user.id);
  revalidatePath('/staff');
}

const newOrg = z.object({
  name: z.string().trim().min(2).max(120),
  ownerEmail: z.string().trim().toLowerCase().email(),
  terms: z.enum(['pilot', ...PAID_PLAN_IDS] as [string, ...string[]]),
  seats: z.coerce.number().int().min(1).max(100_000),
  interval: z.enum(['monthly', 'annual']),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pilotDays: z.coerce.number().int().min(1).max(180),
  notes: z.string().trim().max(2_000).optional(),
});

/**
 * Sales-led onboarding: create the customer's organisation on its agreed plan (or as a pilot) and
 * email its first owner an invitation.
 */
export async function createCustomerOrg(_prev: StaffState, form: FormData): Promise<StaffState> {
  const staff = await requireStaff();
  const input = newOrg.safeParse(Object.fromEntries(form));
  if (!input.success) return { error: 'Check the organisation name, owner email and terms.' };
  const d = input.data;
  const pilot = d.terms === 'pilot';
  const plan = d.terms as PaidPlanId;
  if (!pilot && d.seats < PLANS[plan].minSeats) {
    return { error: `${PLANS[plan].name} has a ${PLANS[plan].minSeats}-seat minimum.` };
  }
  const { org, inviteToken } = await acc().staffCreateOrg({
    name: d.name,
    ownerEmail: d.ownerEmail,
    terms: pilot
      ? { kind: 'pilot', days: d.pilotDays }
      : {
          kind: 'plan',
          plan,
          seats: d.seats,
          interval: d.interval,
          startsOn: d.startsOn,
          endsOn: null,
        },
    notes: d.notes || null,
    staffId: staff.user.id,
  });
  const link = `${env().PUBLIC_SITE_URL}/invite/${inviteToken}`;
  await trySendEmail({
    to: d.ownerEmail,
    subject: `Your Sealcode organisation ${org.name} is ready`,
    text: `Welcome to Sealcode. We've set up ${org.name} ${pilot ? `for a ${d.pilotDays}-day pilot` : `on the ${PLANS[plan].name} plan`}, with you as its owner.\n\nAccept the invitation (valid for 14 days):\n${link}\n\nYou'll set up two-factor sign-in, then invite your team. Each developer connects Claude Code with one command: npx sealcode login`,
  });
  revalidatePath('/staff');
  redirect(`/staff/orgs/${org.id}?created=1`);
}
