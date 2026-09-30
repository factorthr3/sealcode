/**
 * Reading and writing Claude Code's user settings. Sealcode only ever touches the keys it manages
 * in the `env` block; everything else in the file is preserved byte-for-byte in meaning.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { CLAUDE_CODE_MANAGED_KEYS } from '@sealcode/shared';

export interface Paths {
  claudeDir: string;
  settings: string;
  backup: string;
  stateFile: string;
}

export function resolvePaths(env: NodeJS.ProcessEnv = process.env): Paths {
  const claudeDir = env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  const stateDir = env.SEALCODE_HOME || join(homedir(), '.sealcode');
  return {
    claudeDir,
    settings: join(claudeDir, 'settings.json'),
    backup: join(claudeDir, 'settings.json.sealcode-backup'),
    stateFile: join(stateDir, 'config.json'),
  };
}

export type Json = Record<string, unknown>;

export class SettingsError extends Error {
  override name = 'SettingsError';
}

const NO_ORIGINAL = '{"__sealcode_no_original": true}\n';

export function readJson(path: string): Json | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  if (raw.trim() === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SettingsError(
      `${path} is not valid JSON. Fix it (or move it aside) and run the command again; Sealcode won't overwrite it.`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SettingsError(`${path} must contain a JSON object.`);
  }
  return parsed as Json;
}

/** Write via a temporary file and rename, readable only by the user: the file holds a key. */
export function writeJsonAtomic(path: string, data: Json): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows ignores POSIX modes.
  }
}

function envBlock(settings: Json): Record<string, string> {
  const env = settings.env;
  if (env === undefined) return {};
  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    throw new SettingsError('The "env" entry in settings.json must be an object.');
  }
  return env as Record<string, string>;
}

/** Merge Sealcode's variables into the settings' `env` block, keeping every other entry. */
export function mergeSealcodeEnv(settings: Json, values: Record<string, string>): Json {
  return { ...settings, env: { ...envBlock(settings), ...values } };
}

/**
 * Undo `mergeSealcodeEnv`: each managed key goes back to its value in the backup, or is removed
 * if the original didn't have it. Changes made since login to anything else are kept.
 */
export function removeSealcodeEnv(current: Json, original: Json | null): Json {
  const env = { ...envBlock(current) };
  const before = original ? envBlock(original) : {};
  for (const key of CLAUDE_CODE_MANAGED_KEYS) {
    if (key in before) env[key] = before[key]!;
    else delete env[key];
  }
  const next: Json = { ...current };
  if (Object.keys(env).length === 0 && !(original && 'env' in original)) delete next.env;
  else next.env = env;
  return next;
}

/** Back up the original settings once; later logins keep the first backup. */
export function backupOnce(paths: Paths): void {
  if (existsSync(paths.backup)) return;
  mkdirSync(dirname(paths.backup), { recursive: true });
  const original = existsSync(paths.settings) ? readFileSync(paths.settings, 'utf8') : NO_ORIGINAL;
  writeFileSync(paths.backup, original, { mode: 0o600 });
}

export function readBackup(paths: Paths): { exists: boolean; original: Json | null } {
  if (!existsSync(paths.backup)) return { exists: false, original: null };
  const data = readJson(paths.backup) ?? {};
  return { exists: true, original: data.__sealcode_no_original ? null : data };
}

export function removeFile(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}

export interface CliState {
  site: string;
  baseUrl: string;
  org: string;
  email: string;
  keyLast4: string;
  loggedInAt: string;
}

export function readState(paths: Paths): CliState | null {
  try {
    return readJson(paths.stateFile) as CliState | null;
  } catch {
    return null;
  }
}

export function writeState(paths: Paths, state: CliState): void {
  writeJsonAtomic(paths.stateFile, state as unknown as Json);
}
