import 'server-only';
import { accounts, createDb, forOrg } from '@sealcode/db';
import { env } from './env';

type Handle = ReturnType<typeof createDb>;
const globalForDb = globalThis as unknown as { sealcodeDb?: Handle };

/** One pool per server process (and per dev hot-reload cycle). */
export function database(): Handle {
  globalForDb.sealcodeDb ??= createDb(env().DATABASE_URL, { max: 10 });
  return globalForDb.sealcodeDb;
}

export const db = () => database().db;
export const acc = () => accounts(db());
export const tenant = (orgId: string) => forOrg(db(), orgId);
