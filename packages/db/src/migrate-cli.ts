import { existsSync } from 'node:fs';
import { createDb } from './client';
import { runMigrations } from './migrate';

const envFile = new URL('../../../.env', import.meta.url);
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const { db, close } = createDb(url, { max: 1 });
await runMigrations(db);
await close();
process.stdout.write('migrations applied\n');
