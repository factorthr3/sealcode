import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { main } from '../src/cli';
import type { Io } from '../src/commands';
import { mergeSealcodeEnv, removeSealcodeEnv } from '../src/settings';

const KEY_1 = `sc_live_${'a'.repeat(43)}`;
const KEY_2 = `sc_live_${'b'.repeat(43)}`;

function harness(
  opts: { settings?: unknown; env?: Record<string, string>; deny?: boolean; key?: string } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), 'sealcode-cli-'));
  const claudeDir = join(dir, '.claude');
  mkdirSync(claudeDir);
  if (opts.settings !== undefined) {
    writeFileSync(
      join(claudeDir, 'settings.json'),
      typeof opts.settings === 'string' ? opts.settings : JSON.stringify(opts.settings, null, 2),
    );
  }
  const lines: string[] = [];
  const calls: { url: string; auth?: string | null; body?: string }[] = [];
  let polls = 0;
  const revoked: string[] = [];
  const fakeFetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, auth: headers.get('authorization'), body: init?.body as string | undefined });
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (url.endsWith('/api/cli/device')) {
      return json({
        device_code: 'dev-code',
        user_code: 'BCDF-GHJK',
        verification_uri: 'https://site.test/device',
        verification_uri_complete: 'https://site.test/device?code=BCDF-GHJK',
        expires_in: 600,
        interval: 1,
      });
    }
    if (url.endsWith('/api/cli/token')) {
      polls++;
      if (polls < 2) return json({ status: 'pending' }, 202);
      if (opts.deny) return json({ status: 'denied' }, 400);
      return json({
        status: 'approved',
        api_key: opts.key ?? KEY_1,
        base_url: 'https://api.site.test',
        org: 'Acme Payments',
        email: 'dev@acme.test',
      });
    }
    if (url.endsWith('/api/cli/revoke')) {
      revoked.push(headers.get('authorization') ?? '');
      return json({ revoked: true });
    }
    if (url.endsWith('/v1/models'))
      return json({ data: [{ id: 'sealcode-pro' }, { id: 'sealcode-fast' }] });
    return json({}, 404);
  }) as typeof fetch;
  const opened: string[] = [];
  const io: Io = {
    env: { CLAUDE_CONFIG_DIR: claudeDir, SEALCODE_HOME: join(dir, '.sealcode'), ...opts.env },
    print: (l = '') => lines.push(l),
    fetch: fakeFetch,
    openUrl: (u) => opened.push(u),
    sleep: async () => undefined,
    hostname: () => 'test-laptop',
    platform: 'linux',
    claudeVersion: () => '2.1.290 (Claude Code)',
    color: false,
  };
  const settingsPath = join(claudeDir, 'settings.json');
  return {
    io,
    lines,
    calls,
    opened,
    revoked,
    settingsPath,
    backupPath: join(claudeDir, 'settings.json.sealcode-backup'),
    read: () => JSON.parse(readFileSync(settingsPath, 'utf8')),
    run: (...argv: string[]) => main(argv, io),
  };
}

const ORIGINAL = {
  model: 'opus',
  permissions: { allow: ['Bash(npm test:*)'] },
  env: { EDITOR: 'vim', ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-8' },
};

describe('sealcode login', () => {
  it('runs the device flow and merges settings without losing other entries', async () => {
    const h = harness({ settings: ORIGINAL });
    expect(await h.run('login', '--site', 'https://site.test')).toBe(0);
    expect(h.opened).toEqual(['https://site.test/device?code=BCDF-GHJK']);
    expect(JSON.parse(h.calls[0]!.body!)).toEqual({ client_name: 'test-laptop' });
    const s = h.read();
    expect(s.model).toBe('opus');
    expect(s.permissions).toEqual(ORIGINAL.permissions);
    expect(s.env).toEqual({
      EDITOR: 'vim',
      ANTHROPIC_BASE_URL: 'https://api.site.test',
      ANTHROPIC_AUTH_TOKEN: KEY_1,
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'sealcode-pro',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'sealcode-pro',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'sealcode-fast',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
    });
    expect(JSON.parse(readFileSync(h.backupPath, 'utf8'))).toEqual(ORIGINAL);
    expect(h.lines.join('\n')).toContain('Signed in as dev@acme.test (Acme Payments)');
  });

  it('creates settings.json when there is none', async () => {
    const h = harness();
    expect(await h.run('login', '--no-browser')).toBe(0);
    expect(h.opened).toEqual([]);
    expect(h.read().env.ANTHROPIC_AUTH_TOKEN).toBe(KEY_1);
  });

  it('keeps the first backup and revokes the replaced key on a second login', async () => {
    const h = harness({ settings: ORIGINAL });
    await h.run('login');
    const h2 = { ...h, io: { ...h.io } };
    await main(['login'], { ...h2.io, fetch: harness({ key: KEY_2 }).io.fetch });
    // The backup still holds the pre-Sealcode original.
    expect(JSON.parse(readFileSync(h.backupPath, 'utf8'))).toEqual(ORIGINAL);
    expect(h.read().env.ANTHROPIC_AUTH_TOKEN).toBe(KEY_2);
  });

  it('refuses to touch invalid settings.json', async () => {
    const h = harness({ settings: '{ "model": "opus", }' });
    expect(await h.run('login')).toBe(1);
    expect(readFileSync(h.settingsPath, 'utf8')).toBe('{ "model": "opus", }');
    expect(h.calls).toHaveLength(0);
  });

  it('reports denial and leaves settings alone', async () => {
    const h = harness({ settings: ORIGINAL, deny: true });
    expect(await h.run('login')).toBe(1);
    expect(h.read()).toEqual(ORIGINAL);
    expect(existsSync(h.backupPath)).toBe(false);
  });

  it('warns about a conflicting ANTHROPIC_API_KEY', async () => {
    const h = harness({ env: { ANTHROPIC_API_KEY: 'sk-ant-x' } });
    await h.run('login');
    expect(h.lines.join('\n')).toContain('unset ANTHROPIC_API_KEY');
  });
});

describe('sealcode logout', () => {
  it('revokes the key and restores the original settings', async () => {
    const h = harness({ settings: ORIGINAL });
    await h.run('login', '--site', 'https://site.test');
    expect(await h.run('logout')).toBe(0);
    expect(h.revoked).toEqual([`Bearer ${KEY_1}`]);
    expect(h.read()).toEqual(ORIGINAL);
    expect(existsSync(h.backupPath)).toBe(false);
  });

  it('keeps changes made after login', async () => {
    const h = harness({ settings: ORIGINAL });
    await h.run('login');
    const s = h.read();
    s.theme = 'dark';
    s.env.MY_VAR = '1';
    writeFileSync(h.settingsPath, JSON.stringify(s));
    await h.run('logout');
    expect(h.read()).toEqual({ ...ORIGINAL, theme: 'dark', env: { ...ORIGINAL.env, MY_VAR: '1' } });
  });

  it('deletes settings.json it created', async () => {
    const h = harness();
    await h.run('login');
    await h.run('logout');
    expect(existsSync(h.settingsPath)).toBe(false);
  });
});

describe('sealcode doctor', () => {
  it('passes a clean setup', async () => {
    const h = harness();
    await h.run('login');
    expect(await h.run('doctor')).toBe(0);
    expect(h.lines.join('\n')).toContain('models: sealcode-pro, sealcode-fast');
  });

  it('flags a conflicting ANTHROPIC_API_KEY and an apiKeyHelper', async () => {
    const h = harness({
      settings: { apiKeyHelper: '~/bin/key.sh' },
      env: { ANTHROPIC_API_KEY: 'sk-ant-x' },
    });
    await h.run('login');
    expect(await h.run('doctor')).toBe(1);
    const out = h.lines.join('\n');
    expect(out).toContain('ANTHROPIC_API_KEY is set in your shell');
    expect(out).toContain('apiKeyHelper');
  });

  it('gives PowerShell instructions on Windows', async () => {
    const h = harness({ env: { ANTHROPIC_API_KEY: 'sk-ant-x' } });
    h.io.platform = 'win32';
    await h.run('doctor');
    expect(h.lines.join('\n')).toContain('Remove-Item Env:ANTHROPIC_API_KEY');
  });

  it('says what to do when not logged in', async () => {
    const h = harness();
    expect(await h.run('doctor')).toBe(1);
    expect(h.lines.join('\n')).toContain('Run npx sealcode login');
  });
});

describe('settings helpers', () => {
  it('round-trips merge and remove', () => {
    const merged = mergeSealcodeEnv(ORIGINAL, {
      ANTHROPIC_BASE_URL: 'x',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'sealcode-pro',
    });
    expect(removeSealcodeEnv(merged, ORIGINAL)).toEqual(ORIGINAL);
    expect(removeSealcodeEnv(mergeSealcodeEnv({}, { ANTHROPIC_BASE_URL: 'x' }), null)).toEqual({});
  });
});
