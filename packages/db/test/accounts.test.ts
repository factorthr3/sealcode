import { hashApiKey } from '@sealcode/shared/node';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { accounts } from '../src/accounts';
import { createGatewayStore } from '../src/gateway-store';
import { magicLinks } from '../src/schema';
import { makeOrg, PEPPER, testDb, uniqueEmail } from './helpers';
import { hashToken } from '@sealcode/shared/node';

const { db, sql, close } = testDb();
const acc = accounts(db);
afterAll(close);

describe('magic links', () => {
  it('are single use', async () => {
    const email = uniqueEmail('Magic');
    const token = await acc.createMagicLink(email.toUpperCase(), '/app');
    expect(await acc.consumeMagicLink(token)).toEqual({ email: email.toLowerCase(), next: '/app' });
    expect(await acc.consumeMagicLink(token)).toBeNull();
  });

  it('expire', async () => {
    const token = await acc.createMagicLink(uniqueEmail('late'));
    await db
      .update(magicLinks)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(magicLinks.tokenHash, hashToken(token)));
    expect(await acc.consumeMagicLink(token)).toBeNull();
  });

  it('store only a hash', async () => {
    const token = await acc.createMagicLink(uniqueEmail('hash'));
    const rows = await db.select().from(magicLinks);
    expect(JSON.stringify(rows)).not.toContain(token);
  });
});

describe('sessions', () => {
  it('resolve the user and record MFA and org switches', async () => {
    const user = await acc.upsertUser(uniqueEmail('session'));
    const token = await acc.createSession(user.id, null);
    const found = await acc.sessionByToken(token);
    expect(found?.user.id).toBe(user.id);
    expect(found?.session.mfaVerifiedAt).toBeNull();
    await acc.markSessionMfa(token);
    expect((await acc.sessionByToken(token))?.session.mfaVerifiedAt).not.toBeNull();
    await acc.deleteSession(token);
    expect(await acc.sessionByToken(token)).toBeNull();
  });
});

describe('invites', () => {
  it('must be accepted by the invited email', async () => {
    const org = await makeOrg(db, 'inv');
    const intruder = await acc.upsertUser(uniqueEmail('intruder'));
    const { token } = await org.tenant.createInvite({
      email: uniqueEmail('invitee'),
      role: 'developer',
      invitedBy: org.owner.id,
    });
    expect(await acc.acceptInvite(token, intruder)).toEqual({
      ok: false,
      reason: 'email_mismatch',
    });
    expect(await acc.acceptInvite('nope', intruder)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('count against seats until accepted', async () => {
    const org = await makeOrg(db, 'seats');
    expect(await org.tenant.seatsInUse()).toBe(2);
    const email = uniqueEmail('new');
    const { token } = await org.tenant.createInvite({
      email,
      role: 'developer',
      invitedBy: org.owner.id,
    });
    expect(await org.tenant.seatsInUse()).toBe(3);
    const user = await acc.upsertUser(email);
    expect((await acc.acceptInvite(token, user)).ok).toBe(true);
    expect(await org.tenant.seatsInUse()).toBe(3);
    // Billing members don't take a seat.
    await org.tenant.createInvite({
      email: uniqueEmail('billing'),
      role: 'billing',
      invitedBy: org.owner.id,
    });
    expect(await org.tenant.seatsInUse()).toBe(3);
  });
});

describe('CLI device codes', () => {
  it('mint a working key once, on the first poll after approval', async () => {
    const org = await makeOrg(db, 'device');
    const { deviceCode, userCode } = await acc.createDeviceCode('chris-mbp.local');
    expect(userCode).toMatch(/^[B-Z]{4}-[B-Z]{4}$/);
    expect(await acc.pollDeviceCode(deviceCode, PEPPER)).toEqual({ status: 'pending' });
    expect(await acc.pendingDeviceCode(userCode.toLowerCase())).not.toBeNull();
    expect(await acc.approveDeviceCode(userCode, org.dev.id, org.org.id)).toBe(true);

    const first = await acc.pollDeviceCode(deviceCode, PEPPER);
    expect(first).toMatchObject({
      status: 'approved',
      orgName: org.org.name,
      email: org.dev.email,
    });
    const key = (first as { key: string }).key;
    const ctx = await createGatewayStore(sql).findKey(hashApiKey(key, PEPPER));
    expect(ctx).toMatchObject({ orgId: org.org.id, userId: org.dev.id, revoked: false });
    expect(
      (await org.tenant.keys({ userId: org.dev.id })).some((k) => k.name === 'chris-mbp.local'),
    ).toBe(true);

    expect(await acc.pollDeviceCode(deviceCode, PEPPER)).toEqual({ status: 'consumed' });
  });

  it('report denial', async () => {
    const { deviceCode, userCode } = await acc.createDeviceCode('x');
    await acc.denyDeviceCode(userCode);
    expect(await acc.pollDeviceCode(deviceCode, PEPPER)).toEqual({ status: 'denied' });
    expect(await acc.pollDeviceCode('unknown', PEPPER)).toEqual({ status: 'invalid' });
  });
});

describe('orgs', () => {
  it('start on a trial with the creator as owner', async () => {
    const owner = await acc.upsertUser(uniqueEmail('founder'));
    const org = await acc.createOrgWithOwner({ name: 'Acme Payments', ownerId: owner.id });
    expect(org).toMatchObject({ status: 'trial', plan: 'trial', seats: 6, budgetMode: 'hard' });
    expect(org.slug).toMatch(/^acme-payments-/);
    expect((await acc.userOrgs(owner.id))[0]).toMatchObject({ id: org.id, role: 'owner' });
    expect(await acc.orgAdminEmails(org.id)).toEqual([owner.email]);
  });
});

describe('sales-led organisations', () => {
  it('creates a paid organisation with its agreement and invites the owner', async () => {
    const staff = await acc.upsertUser(uniqueEmail('staff-create'));
    const ownerEmail = uniqueEmail('Customer-Owner');
    const { org, inviteToken } = await acc.staffCreateOrg({
      name: 'Initech',
      ownerEmail,
      terms: {
        kind: 'plan',
        plan: 'business',
        seats: 25,
        interval: 'annual',
        startsOn: '2026-10-01',
        endsOn: null,
      },
      notes: 'Agreed per-seat price in order form OF-12',
      staffId: staff.id,
    });
    expect(org).toMatchObject({
      status: 'active',
      plan: 'business',
      seats: 25,
      billingInterval: 'annual',
      budgetMode: 'soft',
    });
    expect(org.activatedAt).not.toBeNull();
    expect(await acc.subscriptionsFor(org.id)).toHaveLength(1);

    const owner = await acc.upsertUser(ownerEmail);
    expect(await acc.acceptInvite(inviteToken, owner)).toMatchObject({ ok: true, orgId: org.id });
    expect((await acc.userOrgs(owner.id))[0]).toMatchObject({ id: org.id, role: 'owner' });
  });

  it('creates a time-limited pilot on pilot terms', async () => {
    const staff = await acc.upsertUser(uniqueEmail('staff-pilot'));
    const { org } = await acc.staffCreateOrg({
      name: 'Design Partner',
      ownerEmail: uniqueEmail('partner'),
      terms: { kind: 'pilot', days: 60 },
      notes: null,
      staffId: staff.id,
    });
    expect(org).toMatchObject({ status: 'trial', plan: 'trial', seats: 6, budgetMode: 'hard' });
    const days = (org.trialEndsAt!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(59.9);
    expect(days).toBeLessThanOrEqual(60);
    expect(await acc.subscriptionsFor(org.id)).toHaveLength(0);
  });
});
