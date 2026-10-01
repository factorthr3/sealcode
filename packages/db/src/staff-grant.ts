/**
 * Grant (or with --revoke, remove) Sealcode staff access. Staff can see every org, activate plans
 * and read enquiries, so this is deliberately a command run by an operator, never a UI action.
 *
 *   pnpm --filter @sealcode/db staff:grant you@sealcode.ai [--revoke]
 */
import { existsSync } from 'node:fs';
import { createDb } from './client';
import { accounts } from './accounts';

const envFile = new URL('../../../.env', import.meta.url);
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
const [email, flag] = process.argv.slice(2);
if (!email || !process.env.DATABASE_URL) {
  process.stderr.write('Usage: staff:grant <email> [--revoke]  (needs DATABASE_URL)\n');
  process.exit(2);
}
const { db, close } = createDb(process.env.DATABASE_URL, { max: 1 });
const ok = await accounts(db).grantStaff(email, flag !== '--revoke');
await close();
process.stdout.write(
  ok
    ? `${flag === '--revoke' ? 'Removed staff access from' : 'Granted staff access to'} ${email}\n`
    : `No user with email ${email}. They must sign in once first.\n`,
);
process.exit(ok ? 0 : 1);
