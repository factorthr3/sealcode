import postgres from 'postgres';
import { createDb } from '../src/client';
import { runMigrations } from '../src/migrate';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/sealcode_test';

/** Rebuild the test database from migrations once per run. */
export default async function setup() {
  const admin = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => undefined });
  await admin.unsafe(
    'drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;',
  );
  await admin.end();
  const { db, close } = createDb(TEST_DATABASE_URL, { max: 1 });
  await runMigrations(db);
  await close();
}
