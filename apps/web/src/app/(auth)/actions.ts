'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { acc } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { env } from '@/lib/env';
import { allow, clientKey } from '@/lib/rate-limit';
import { clearSessionCookie, getSession, setSessionCookie } from '@/lib/session';
import { decryptSecret, encryptSecret, generateTotpSecret, verifyTotp } from '@/lib/totp';

export interface FormState {
  error?: string | null;
}

/** Only same-site relative paths, so the sign-in flow can't be used as an open redirect. */
function safeNext(value: unknown, fallback = '/app'): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : fallback;
}

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export async function requestMagicLink(_prev: FormState, form: FormData): Promise<FormState> {
  const email = emailSchema.safeParse(form.get('email'));
  if (!email.success) return { error: 'Enter a valid work email address.' };
  const company = String(form.get('company') ?? '')
    .trim()
    .slice(0, 120);
  const next = company
    ? `/onboarding?name=${encodeURIComponent(company)}`
    : safeNext(form.get('next'));

  const ip = (await clientKey()) ?? 'shared';
  if (
    !allow(`magic:${email.data}`, 5, 15 * 60_000) ||
    !allow(`magic-ip:${ip}`, ip === 'shared' ? 300 : 20, 15 * 60_000)
  ) {
    return { error: 'Too many sign-in emails. Please wait a few minutes and try again.' };
  }

  const token = await acc().createMagicLink(email.data, next);
  const link = `${env().PUBLIC_SITE_URL}/auth/verify?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email.data,
    subject: 'Your Sealcode sign-in link',
    text: `Use this link to sign in to Sealcode. It works once and expires in 15 minutes.\n\n${link}\n\nIf you didn't ask for it, you can ignore this email.`,
  });
  redirect(`/login/check?email=${encodeURIComponent(email.data)}`);
}

export async function completeSignIn(_prev: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get('token') ?? '');
  const link = token ? await acc().consumeMagicLink(token) : null;
  if (!link)
    return { error: 'This sign-in link has expired or was already used. Request a new one.' };
  const user = await acc().upsertUser(link.email);
  await acc().touchLogin(user.id);
  const orgs = await acc().userOrgs(user.id);
  const sessionToken = await acc().createSession(user.id, orgs[0]?.id ?? null);
  await setSessionCookie(sessionToken);
  const next = safeNext(link.next);
  redirect(
    orgs.length === 0 &&
      !next.startsWith('/onboarding') &&
      !next.startsWith('/invite') &&
      !next.startsWith('/device')
      ? '/onboarding'
      : next,
  );
}

export async function startTotpSetup(form: FormData): Promise<void> {
  const s = await getSession();
  if (!s) redirect('/login');
  const next = encodeURIComponent(safeNext(form.get('next')));
  if (!s.user.totpEnabledAt)
    await acc().setTotpSecret(s.user.id, encryptSecret(generateTotpSecret()));
  redirect(`/auth/2fa?next=${next}`);
}

export async function verifyTwoFactor(_prev: FormState, form: FormData): Promise<FormState> {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!s.user.totpSecretEnc) return { error: 'Set up an authenticator app first.' };
  if (!allow(`totp:${s.user.id}`, 8, 5 * 60_000))
    return { error: 'Too many attempts. Wait five minutes and try again.' };
  const ok = verifyTotp(
    decryptSecret(s.user.totpSecretEnc),
    String(form.get('code') ?? ''),
    s.user.id,
  );
  if (!ok)
    return { error: "That code didn't match. Check your device's clock and try the latest code." };
  if (!s.user.totpEnabledAt) await acc().enableTotp(s.user.id);
  await acc().markSessionMfa(s.token);
  redirect(safeNext(form.get('next')));
}

const orgSchema = z.string().trim().min(2, 'Enter your company or team name.').max(120);

export async function createOrganisation(_prev: FormState, form: FormData): Promise<FormState> {
  const s = await getSession();
  if (!s) redirect('/login?next=/onboarding');
  const name = orgSchema.safeParse(form.get('name'));
  if (!name.success) return { error: name.error.issues[0]?.message ?? 'Enter a name.' };
  if (s.orgs.filter((o) => o.role === 'owner').length >= 3) {
    return { error: 'You already own three organisations. Contact us if you need more.' };
  }
  const org = await acc().createOrgWithOwner({ name: name.data, ownerId: s.user.id });
  await acc().setSessionOrg(s.token, org.id);
  // Owners must use two-factor login: set it up before the dashboard.
  redirect(
    s.user.totpEnabledAt
      ? '/app/connect?welcome=1'
      : '/auth/2fa?next=%2Fapp%2Fconnect%3Fwelcome%3D1',
  );
}

export async function acceptInvitation(token: string): Promise<void> {
  const s = await getSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  const result = await acc().acceptInvite(token, s.user);
  if (!result.ok) redirect(`/invite/${encodeURIComponent(token)}?error=${result.reason}`);
  await acc().setSessionOrg(s.token, result.orgId);
  redirect('/app/connect?welcome=1');
}

export async function signOut(): Promise<void> {
  const s = await getSession();
  if (s) await acc().deleteSession(s.token);
  await clearSessionCookie();
  redirect('/');
}

export async function switchOrg(orgId: string): Promise<void> {
  const s = await getSession();
  if (!s) redirect('/login');
  if (s.orgs.some((o) => o.id === orgId)) await acc().setSessionOrg(s.token, orgId);
  redirect('/app');
}
