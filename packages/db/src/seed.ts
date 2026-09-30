/**
 * Local development seed: a staff user and a demo org on a trial with one developer key.
 * Prints the key once. Never run against production.
 */
import { existsSync } from 'node:fs';
import { createDb } from './client';
import { accounts } from './accounts';
import { forOrg } from './tenant';

const envFile = new URL('../../../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (process.env.NODE_ENV === 'production')
  throw new Error('Refusing to seed a production database');
const url = process.env.DATABASE_URL;
const pepper = process.env.KEY_PEPPER;
if (!url || !pepper) throw new Error('DATABASE_URL and KEY_PEPPER must be set');

const email = process.env.SEED_EMAIL ?? 'dev@sealcode.test';
const { db, close } = createDb(url, { max: 1 });
const acc = accounts(db);
const user = await acc.upsertUser(email, 'Dev User');
await acc.grantStaff(email);
const existing = await acc.userOrgs(user.id);
const org =
  existing[0] ?? (await acc.createOrgWithOwner({ name: 'Acme Payments', ownerId: user.id }));
const { key } = await forOrg(db, org.id).issueKey({
  userId: user.id,
  name: 'seed-key',
  actor: user.id,
  pepper,
});
await close();

process.stdout.write(
  [
    `Seeded ${email} (staff) as owner of "${org.name}".`,
    `Sign in at ${process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000'}/login with that email.`,
    `API key (shown once): ${key}`,
    '',
  ].join('\n'),
);
