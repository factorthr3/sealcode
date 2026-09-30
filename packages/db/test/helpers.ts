import { randomUUID } from 'node:crypto';
import { createDb } from '../src/client';
import { accounts } from '../src/accounts';
import { forOrg } from '../src/tenant';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/sealcode_test';
export const PEPPER = 'db-test-pepper-0123456789abcdef0123456789abcdef';

export function testDb() {
  return createDb(TEST_DATABASE_URL, { max: 4 });
}

export const uniqueEmail = (label: string) => `${label}-${randomUUID().slice(0, 8)}@example.test`;

/** An org with an owner, a developer and a key for each. */
export async function makeOrg(db: ReturnType<typeof testDb>['db'], label: string) {
  const acc = accounts(db);
  const owner = await acc.upsertUser(uniqueEmail(`${label}-owner`), `${label} owner`);
  const dev = await acc.upsertUser(uniqueEmail(`${label}-dev`), `${label} dev`);
  const org = await acc.createOrgWithOwner({ name: `${label} Ltd`, ownerId: owner.id });
  const tenant = forOrg(db, org.id);
  const { token } = await tenant.createInvite({
    email: dev.email,
    role: 'developer',
    invitedBy: owner.id,
  });
  await acc.acceptInvite(token, dev);
  const ownerKey = await tenant.issueKey({
    userId: owner.id,
    name: 'owner-laptop',
    actor: owner.id,
    pepper: PEPPER,
  });
  const devKey = await tenant.issueKey({
    userId: dev.id,
    name: 'dev-laptop',
    actor: owner.id,
    pepper: PEPPER,
  });
  return { org, owner, dev, tenant, ownerKey, devKey };
}
