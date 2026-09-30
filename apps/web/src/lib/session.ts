import 'server-only';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { acc, tenant } from './db';
import { env } from './env';
import { can, roleRequiresMfa, type Permission } from './permissions';

export const SESSION_COOKIE = 'sc_session';

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env().production,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 86_400,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed-in user, their orgs and whether two-factor login is satisfied. Cached per request. */
export const getSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const found = await acc().sessionByToken(token);
  if (!found) return null;
  const orgs = await acc().userOrgs(found.user.id);
  const mfaRequired = found.user.isStaff || orgs.some((o) => roleRequiresMfa(o.role));
  return {
    token,
    user: found.user,
    session: found.session,
    orgs,
    mfaRequired,
    mfaSatisfied: !mfaRequired || found.session.mfaVerifiedAt !== null,
  };
});

export type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/** Signed in, with two-factor login done where required. */
export async function requireUser(next = '/app'): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!s.mfaSatisfied) redirect(`/auth/2fa?next=${encodeURIComponent(next)}`);
  return s;
}

/** The active org for the signed-in member, optionally requiring a permission. */
export async function requireOrg(permission?: Permission, next = '/app') {
  const s = await requireUser(next);
  if (s.orgs.length === 0) redirect('/onboarding');
  const org = s.orgs.find((o) => o.id === s.session.activeOrgId) ?? s.orgs[0]!;
  if (permission && !can(org.role, permission)) redirect('/app?denied=1');
  return { ...s, org, role: org.role, repo: tenant(org.id) };
}

export async function requireStaff() {
  const s = await requireUser('/staff');
  if (!s.user.isStaff) notFound();
  return s;
}
