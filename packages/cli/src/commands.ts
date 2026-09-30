import { existsSync } from 'node:fs';
import { CLAUDE_CODE_FIXED_ENV, CLAUDE_CODE_MANAGED_KEYS, claudeCodeEnv } from '@sealcode/shared';
import {
  backupOnce,
  mergeSealcodeEnv,
  readBackup,
  readJson,
  readState,
  removeFile,
  removeSealcodeEnv,
  resolvePaths,
  SettingsError,
  writeJsonAtomic,
  writeState,
  type Json,
} from './settings';

export const DEFAULT_SITE = 'https://sealcode.dev';

/** Everything the commands touch outside the file system, injectable for tests. */
export interface Io {
  env: NodeJS.ProcessEnv;
  print: (line?: string) => void;
  fetch: typeof fetch;
  openUrl: (url: string) => void;
  sleep: (ms: number) => Promise<void>;
  hostname: () => string;
  platform: NodeJS.Platform;
  claudeVersion: () => string | null;
  color: boolean;
}

const paint = (io: Io, code: number, text: string) =>
  io.color ? `\u001b[${code}m${text}\u001b[0m` : text;
const ok = (io: Io, text: string) => io.print(`${paint(io, 32, '✓')} ${text}`);
const warn = (io: Io, text: string) => io.print(`${paint(io, 33, '!')} ${text}`);
const fail = (io: Io, text: string) => io.print(`${paint(io, 31, '✗')} ${text}`);
const dim = (io: Io, text: string) => paint(io, 2, text);
const bold = (io: Io, text: string) => paint(io, 1, text);

function unsetHint(io: Io, name: string): string {
  return io.platform === 'win32'
    ? `Remove-Item Env:${name}  (and delete it from your PowerShell $PROFILE or System Properties)`
    : `unset ${name}  (and remove it from ~/.zshrc, ~/.bashrc or wherever it is exported)`;
}

interface DeviceStart {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  status: 'approved' | 'pending' | 'denied' | 'expired' | 'consumed' | 'invalid' | 'slow_down';
  api_key?: string;
  base_url?: string;
  org?: string;
  email?: string;
}

// --- login -----------------------------------------------------------------------------------------

export async function login(io: Io, opts: { site: string; browser: boolean }): Promise<number> {
  const paths = resolvePaths(io.env);
  // Refuse early if settings.json can't be merged safely.
  let current: Json;
  try {
    current = readJson(paths.settings) ?? {};
    mergeSealcodeEnv(current, {});
  } catch (err) {
    fail(io, err instanceof SettingsError ? err.message : 'Could not read Claude Code settings.');
    return 1;
  }

  let start: DeviceStart;
  try {
    const res = await io.fetch(`${opts.site}/api/cli/device`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: io.hostname() }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    start = (await res.json()) as DeviceStart;
  } catch (err) {
    fail(
      io,
      `Couldn't reach ${opts.site} (${(err as Error).message}). Check your network or --site.`,
    );
    return 1;
  }

  io.print();
  io.print(`  Your one-time code: ${bold(io, start.user_code)}`);
  io.print(`  Approve it at ${start.verification_uri_complete}`);
  io.print();
  if (opts.browser) io.openUrl(start.verification_uri_complete);
  io.print(dim(io, '  Waiting for approval in the browser…'));

  const deadline = Date.now() + start.expires_in * 1000;
  let interval = Math.max(1, start.interval) * 1000;
  let token: TokenResponse | null = null;
  while (Date.now() < deadline) {
    await io.sleep(interval);
    let res: Response;
    try {
      res = await io.fetch(`${opts.site}/api/cli/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ device_code: start.device_code }),
      });
    } catch {
      continue;
    }
    const body = (await res.json().catch(() => ({ status: 'invalid' }))) as TokenResponse;
    if (body.status === 'pending') continue;
    if (body.status === 'slow_down') {
      interval += 2000;
      continue;
    }
    token = body;
    break;
  }

  if (!token || token.status !== 'approved' || !token.api_key || !token.base_url) {
    const reason = !token
      ? 'The code expired before it was approved.'
      : token.status === 'denied'
        ? 'The request was denied in the browser.'
        : `Login failed (${token.status}).`;
    fail(io, `${reason} Run npx sealcode login again.`);
    return 1;
  }

  // Replace any earlier Sealcode key in these settings, and revoke it once the new one is saved.
  const previousKey = (current.env as Record<string, string> | undefined)?.ANTHROPIC_AUTH_TOKEN;
  backupOnce(paths);
  writeJsonAtomic(
    paths.settings,
    mergeSealcodeEnv(current, claudeCodeEnv(token.base_url, token.api_key)),
  );
  writeState(paths, {
    site: opts.site,
    baseUrl: token.base_url,
    org: token.org ?? '',
    email: token.email ?? '',
    keyLast4: token.api_key.slice(-4),
    loggedInAt: new Date().toISOString(),
  });
  if (previousKey?.startsWith('sc_live_') && previousKey !== token.api_key) {
    await revoke(io, opts.site, previousKey);
  }

  io.print();
  ok(io, `Signed in as ${token.email} (${token.org})`);
  ok(io, `Claude Code now uses ${token.base_url} with sealcode-pro and sealcode-fast`);
  ok(io, `Settings merged into ${paths.settings}; original backed up to ${paths.backup}`);
  if (io.env.ANTHROPIC_API_KEY) {
    warn(
      io,
      `ANTHROPIC_API_KEY is set in your shell. Unset it so it can't conflict:\n    ${unsetHint(io, 'ANTHROPIC_API_KEY')}`,
    );
  }
  io.print();
  io.print(
    `  Start coding: ${bold(io, 'claude')}   Check the setup: ${bold(io, 'npx sealcode doctor')}`,
  );
  return 0;
}

async function revoke(io: Io, site: string, key: string): Promise<boolean> {
  try {
    const res = await io.fetch(`${site}/api/cli/revoke`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}` },
    });
    return res.ok && ((await res.json()) as { revoked?: boolean }).revoked === true;
  } catch {
    return false;
  }
}

// --- logout ----------------------------------------------------------------------------------------

export async function logout(io: Io): Promise<number> {
  const paths = resolvePaths(io.env);
  const state = readState(paths);
  let current: Json | null;
  let backup: ReturnType<typeof readBackup>;
  try {
    current = readJson(paths.settings);
    backup = readBackup(paths);
  } catch (err) {
    fail(io, err instanceof SettingsError ? err.message : 'Could not read Claude Code settings.');
    return 1;
  }
  const key = (current?.env as Record<string, string> | undefined)?.ANTHROPIC_AUTH_TOKEN;
  if (key?.startsWith('sc_live_')) {
    const revoked = await revoke(io, state?.site ?? DEFAULT_SITE, key);
    if (revoked) ok(io, 'Revoked this device’s API key');
    else
      warn(
        io,
        'Couldn’t revoke the key online. An admin can revoke it in the dashboard under API keys.',
      );
  }
  if (current) {
    const restored = removeSealcodeEnv(current, backup.original);
    if (!backup.original && Object.keys(restored).length === 0) removeFile(paths.settings);
    else writeJsonAtomic(paths.settings, restored);
    ok(
      io,
      backup.exists
        ? 'Restored your original Claude Code settings'
        : 'Removed Sealcode settings from Claude Code',
    );
  } else {
    ok(io, 'Claude Code settings had no Sealcode configuration');
  }
  removeFile(paths.backup);
  removeFile(paths.stateFile);
  return 0;
}

// --- doctor ----------------------------------------------------------------------------------------

const MANAGED_SETTINGS: Partial<Record<NodeJS.Platform, string>> = {
  darwin: '/Library/Application Support/ClaudeCode/managed-settings.json',
  linux: '/etc/claude-code/managed-settings.json',
  win32: 'C:\\ProgramData\\ClaudeCode\\managed-settings.json',
};

export async function doctor(io: Io, opts: { live: boolean }): Promise<number> {
  const paths = resolvePaths(io.env);
  let problems = 0;
  const problem = (text: string) => {
    problems++;
    fail(io, text);
  };

  const version = io.claudeVersion();
  if (version) ok(io, `Claude Code ${version}`);
  else warn(io, 'Claude Code not found on PATH. Install it: https://code.claude.com/docs');

  let settings: Json | null = null;
  try {
    settings = readJson(paths.settings);
  } catch (err) {
    problem(err instanceof SettingsError ? err.message : 'Could not read settings.json');
  }
  const env = (settings?.env ?? {}) as Record<string, string>;
  const key = env.ANTHROPIC_AUTH_TOKEN;
  const baseUrl = env.ANTHROPIC_BASE_URL;
  if (!key?.startsWith('sc_live_') || !baseUrl) {
    problem(`No Sealcode configuration in ${paths.settings}. Run npx sealcode login.`);
  } else {
    ok(io, `Settings point Claude Code at ${baseUrl} (key …${key.slice(-4)})`);
    for (const [name, value] of Object.entries(CLAUDE_CODE_FIXED_ENV)) {
      if (env[name] !== value)
        warn(
          io,
          `${name} is "${env[name] ?? ''}" in settings; Sealcode expects "${value}". Run npx sealcode login to repair.`,
        );
    }
  }

  // Conflicts that change which credential or endpoint Claude Code uses.
  if (io.env.ANTHROPIC_API_KEY)
    problem(
      `ANTHROPIC_API_KEY is set in your shell and conflicts with the Sealcode key.\n    ${unsetHint(io, 'ANTHROPIC_API_KEY')}`,
    );
  if (env.ANTHROPIC_API_KEY)
    problem('ANTHROPIC_API_KEY is set in settings.json. Remove it from the "env" block.');
  if (settings?.apiKeyHelper)
    problem('settings.json has an apiKeyHelper, which overrides the Sealcode key. Remove it.');
  for (const name of [
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_VERTEX',
    'CLAUDE_CODE_USE_FOUNDRY',
  ]) {
    if (io.env[name] || env[name])
      problem(`${name} is set, so Claude Code bypasses ANTHROPIC_BASE_URL. Unset it.`);
  }
  if (io.env.ANTHROPIC_BASE_URL && io.env.ANTHROPIC_BASE_URL !== baseUrl) {
    warn(
      io,
      `ANTHROPIC_BASE_URL is also set in your shell (${io.env.ANTHROPIC_BASE_URL}). settings.json wins, but consider removing it.`,
    );
  }
  const managed = MANAGED_SETTINGS[io.platform];
  if (managed && existsSync(managed)) {
    try {
      const m = readJson(managed) ?? {};
      if (m.forceLoginMethod || m.forceLoginOrgUUID)
        problem(
          `Managed settings (${managed}) force a claude.ai login, which blocks gateway keys. Ask IT to remove forceLoginMethod.`,
        );
      const menv = (m.env ?? {}) as Record<string, string>;
      for (const k of CLAUDE_CODE_MANAGED_KEYS)
        if (k in menv) warn(io, `Managed settings set ${k}, which overrides your settings.`);
    } catch {
      warn(io, `Couldn't read managed settings at ${managed}.`);
    }
  }

  // Connectivity with the configured key.
  if (key && baseUrl) {
    try {
      const res = await io.fetch(`${baseUrl}/v1/models`, {
        headers: { authorization: `Bearer ${key}`, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const ids =
          ((await res.json()) as { data?: { id: string }[] }).data?.map((m) => m.id) ?? [];
        ok(io, `Gateway reachable; key accepted; models: ${ids.join(', ')}`);
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        problem(
          `Gateway refused the key (HTTP ${res.status}): ${body.error?.message ?? 'unknown error'}`,
        );
      }
    } catch (err) {
      problem(
        `Couldn't reach ${baseUrl} (${(err as Error).message}). Check VPN, proxy or firewall rules.`,
      );
    }
    if (opts.live && problems === 0) {
      const started = Date.now();
      try {
        const res = await io.fetch(`${baseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${key}`,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'sealcode-fast',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }],
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (res.ok)
          ok(
            io,
            `Test request completed in ${Date.now() - started} ms; receipt ${res.headers.get('x-receipt-id') ?? 'missing'}`,
          );
        else problem(`Test request failed with HTTP ${res.status}`);
      } catch (err) {
        problem(`Test request failed: ${(err as Error).message}`);
      }
    }
  }

  io.print();
  if (problems === 0) ok(io, bold(io, 'All good. Run claude to start coding.'));
  else io.print(`${problems} problem${problems === 1 ? '' : 's'} found.`);
  return problems === 0 ? 0 : 1;
}
