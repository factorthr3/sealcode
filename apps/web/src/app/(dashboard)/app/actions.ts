'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { PAID_PLAN_IDS, PLANS, SALES_EMAIL, type BudgetMode } from '@sealcode/shared';
import { seatLimit, type Role } from '@sealcode/db';
import { acc } from '@/lib/db';
import { sendEmail, trySendEmail } from '@/lib/email';
import { env } from '@/lib/env';
import { can } from '@/lib/permissions';
import { allow } from '@/lib/rate-limit';
import { requireOrg } from '@/lib/session';

export interface ActionState {
  error?: string | null;
  ok?: string | null;
  /** A newly minted API key, shown once. */
  key?: string | null;
}

const ROLES = ['owner', 'admin', 'developer', 'billing'] as const;

// --- API keys -------------------------------------------------------------------------------------

const keySchema = z.object({
  name: z.string().trim().min(1, 'Name the key after the device it will live on.').max(80),
  userId: z.string().uuid().optional(),
});

export async function createKey(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireOrg();
  const input = keySchema.safeParse({
    name: form.get('name'),
    userId: form.get('userId') || undefined,
  });
  if (!input.success) return { error: input.error.issues[0]?.message };
  const forUser = input.data.userId ?? ctx.user.id;
  if (forUser !== ctx.user.id && !can(ctx.role, 'keys.manage_all'))
    return { error: 'You can only create keys for yourself.' };
  if (ctx.role === 'billing' && forUser === ctx.user.id)
    return { error: 'Billing members don’t hold API keys.' };
  try {
    const { key } = await ctx.repo.issueKey({
      userId: forUser,
      name: input.data.name,
      actor: ctx.user.id,
      pepper: env().KEY_PEPPER,
    });
    revalidatePath('/app/keys');
    return { key, ok: 'Key created. Copy it now: it won’t be shown again.' };
  } catch {
    return { error: 'That member can’t hold keys.' };
  }
}

export async function revokeKey(keyId: string): Promise<void> {
  const ctx = await requireOrg();
  await ctx.repo.revokeKey(
    keyId,
    ctx.user.id,
    can(ctx.role, 'keys.manage_all') ? {} : { onlyOwnedBy: ctx.user.id },
  );
  revalidatePath('/app/keys');
}

// --- members ----------------------------------------------------------------------------------------

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  role: z.enum(ROLES),
});

export async function inviteMember(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireOrg('members.manage');
  const input = inviteSchema.safeParse({ email: form.get('email'), role: form.get('role') });
  if (!input.success) return { error: input.error.issues[0]?.message };
  if (input.data.role === 'owner' && ctx.role !== 'owner')
    return { error: 'Only owners can invite owners.' };
  const org = await ctx.repo.org();
  if (!org) return { error: 'Organisation not found.' };
  const members = await ctx.repo.members();
  if (members.some((m) => m.email === input.data.email))
    return { error: 'They’re already a member.' };
  if (input.data.role !== 'billing' && (await ctx.repo.seatsInUse()) >= seatLimit(org)) {
    return {
      error:
        org.status === 'trial'
          ? `Your trial includes ${seatLimit(org)} seats. Activate a plan to add more.`
          : `All ${seatLimit(org)} seats are in use. Contact ${SALES_EMAIL} to add seats.`,
    };
  }
  if (!allow(`invite:${org.id}`, 50, 3_600_000))
    return { error: 'Too many invitations this hour.' };
  const { token } = await ctx.repo.createInvite({
    email: input.data.email,
    role: input.data.role,
    invitedBy: ctx.user.id,
  });
  const link = `${env().PUBLIC_SITE_URL}/invite/${token}`;
  const sent = await trySendEmail({
    to: input.data.email,
    subject: `${ctx.user.name ?? ctx.user.email} invited you to ${org.name} on Sealcode`,
    text: `You've been invited to join ${org.name} on Sealcode, the confidential gateway for AI coding tools.\n\nAccept the invitation (valid for 7 days):\n${link}\n\nOnce you've joined, run \`npx sealcode login\` to connect Claude Code.`,
  });
  revalidatePath('/app/members');
  return sent
    ? { ok: `Invitation sent to ${input.data.email}.` }
    : { error: 'The invitation was created but the email failed. Try again shortly.' };
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const ctx = await requireOrg('members.manage');
  await ctx.repo.revokeInvite(inviteId, ctx.user.id);
  revalidatePath('/app/members');
}

async function ownerCount(ctx: Awaited<ReturnType<typeof requireOrg>>) {
  return (await ctx.repo.members()).filter((m) => m.role === 'owner').length;
}

export async function changeRole(userId: string, form: FormData): Promise<void> {
  const ctx = await requireOrg('members.manage');
  const role = z.enum(ROLES).safeParse(form.get('role'));
  if (!role.success) return;
  const current = await ctx.repo.roleOf(userId);
  if (!current) return;
  // Only owners change ownership, and an org always keeps at least one owner.
  if ((current === 'owner' || role.data === 'owner') && ctx.role !== 'owner') return;
  if (current === 'owner' && role.data !== 'owner' && (await ownerCount(ctx)) <= 1) return;
  await ctx.repo.setRole(userId, role.data as Role, ctx.user.id);
  revalidatePath('/app/members');
}

export async function removeMember(userId: string): Promise<void> {
  const ctx = await requireOrg('members.manage');
  const current = await ctx.repo.roleOf(userId);
  if (!current) return;
  if (current === 'owner' && (ctx.role !== 'owner' || (await ownerCount(ctx)) <= 1)) return;
  await ctx.repo.removeMember(userId, ctx.user.id);
  revalidatePath('/app/members');
}

// --- budgets ----------------------------------------------------------------------------------------

/** Accepts "20M", "500k", "1,000,000" or an empty field (no cap). */
function parseTokenAmount(raw: FormDataEntryValue | null): number | null | 'invalid' {
  const text = String(raw ?? '')
    .trim()
    .replace(/[, _]/g, '')
    .toLowerCase();
  if (!text) return null;
  const m = /^(\d+(?:\.\d+)?)([km]?)$/.exec(text);
  if (!m) return 'invalid';
  const n = Number(m[1]) * (m[2] === 'm' ? 1_000_000 : m[2] === 'k' ? 1_000 : 1);
  return Number.isFinite(n) && n > 0 && n < 1e13 ? Math.round(n) : 'invalid';
}

export async function saveBudgets(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireOrg('budgets.manage');
  const mode = z.enum(['hard', 'soft']).safeParse(form.get('mode'));
  const orgBudget = parseTokenAmount(form.get('orgBudget'));
  const seatDefault = parseTokenAmount(form.get('seatDefault'));
  if (!mode.success || orgBudget === 'invalid' || seatDefault === 'invalid') {
    return { error: 'Enter budgets as whole tokens, such as 50M or 250k, or leave them empty.' };
  }
  const org = await ctx.repo.org();
  if (org?.status !== 'trial') await ctx.repo.setBudgetMode(mode.data as BudgetMode, ctx.user.id);
  await ctx.repo.setBudget({ scope: 'org', monthlyTokens: orgBudget, actor: ctx.user.id });
  await ctx.repo.setBudget({ scope: 'seat', monthlyTokens: seatDefault, actor: ctx.user.id });
  revalidatePath('/app/budgets');
  return { ok: 'Budgets saved. The gateway applies them within a few seconds.' };
}

export async function saveSeatBudget(
  userId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const ctx = await requireOrg('budgets.manage');
  const amount = parseTokenAmount(form.get('amount'));
  if (amount === 'invalid') return { error: 'Use a number like 5M.' };
  try {
    await ctx.repo.setBudget({ scope: 'seat', userId, monthlyTokens: amount, actor: ctx.user.id });
  } catch {
    return { error: 'Not a member of this organisation.' };
  }
  revalidatePath('/app/budgets');
  return { ok: 'Saved.' };
}

// --- billing: contact-us activation ----------------------------------------------------------------

const activationSchema = z.object({
  plan: z.enum(PAID_PLAN_IDS as [string, ...string[]]),
  seats: z.coerce.number().int().min(1).max(10_000),
  message: z.string().trim().max(2_000).optional(),
});

export async function requestActivation(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireOrg('billing.view');
  const input = activationSchema.safeParse({
    plan: form.get('plan'),
    seats: form.get('seats'),
    message: form.get('message') || undefined,
  });
  if (!input.success) return { error: 'Choose a plan and a seat count.' };
  const plan = PLANS[input.data.plan as keyof typeof PLANS];
  if (input.data.seats < plan.minSeats)
    return { error: `${plan.name} starts at ${plan.minSeats} seats.` };
  if (!allow(`activation:${ctx.org.id}`, 3, 3_600_000))
    return { error: 'We’ve got your request: we’ll be in touch shortly.' };
  const org = (await ctx.repo.org())!;
  const enquiry = await acc().createEnquiry({
    name: ctx.user.name ?? ctx.user.email,
    email: ctx.user.email,
    company: org.name,
    teamSize: String(input.data.seats),
    planInterest: plan.id,
    seats: input.data.seats,
    message: input.data.message ?? null,
    orgId: org.id,
    source: 'dashboard',
  });
  await trySendEmail({
    to: env().SALES_INBOX,
    subject: `Activation request: ${org.name} (${plan.name}, ${input.data.seats} seats)`,
    text: `Org: ${org.name} (${org.slug}, ${org.id})\nRequested by: ${ctx.user.email}\nPlan: ${plan.name}\nSeats: ${input.data.seats}\n\n${input.data.message ?? ''}\n\nActivate in the staff console: ${env().PUBLIC_SITE_URL}/staff/orgs/${org.id}\nEnquiry ${enquiry.id}`,
  });
  await sendEmail({
    to: ctx.user.email,
    subject: 'We’ve received your Sealcode activation request',
    text: `Thanks. We've received your request to activate ${plan.name} for ${org.name} with ${input.data.seats} seats.\n\nSomeone from our team will reply within one working day with an order form and invoice details. Your trial keeps working in the meantime.`,
  }).catch(() => undefined);
  revalidatePath('/app/billing');
  return {
    ok: 'Request sent. We’ll reply within one working day with an order form and invoice details.',
  };
}

// --- settings ---------------------------------------------------------------------------------------

export async function renameOrg(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireOrg('org.settings');
  const name = z.string().trim().min(2).max(120).safeParse(form.get('name'));
  if (!name.success) return { error: 'Enter a name between 2 and 120 characters.' };
  await ctx.repo.rename(name.data, ctx.user.id);
  revalidatePath('/app', 'layout');
  return { ok: 'Saved.' };
}

export async function updateProfile(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireOrg();
  const name = z.string().trim().min(1).max(120).safeParse(form.get('name'));
  if (!name.success) return { error: 'Enter your name.' };
  await acc().setName(ctx.user.id, name.data);
  revalidatePath('/app/settings');
  return { ok: 'Saved.' };
}
