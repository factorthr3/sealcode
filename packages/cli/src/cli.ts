import { spawn, spawnSync } from 'node:child_process';
import { hostname } from 'node:os';
import { DEFAULT_SITE, doctor, login, logout, type Io } from './commands';

const VERSION = '0.1.0';

const HELP = `sealcode ${VERSION}: connect Claude Code to Sealcode

Usage:
  npx sealcode login [--site URL] [--no-browser]   Approve this device and configure Claude Code
  npx sealcode doctor [--live]                     Check settings, conflicts and connectivity
  npx sealcode logout                              Revoke this device's key and restore your settings

Options:
  --site URL      Sealcode site (default ${DEFAULT_SITE}, or SEALCODE_SITE)
  --no-browser    Print the approval link instead of opening a browser
  --live          doctor: also send a one-token test request

Claude and Claude Code are trademarks of Anthropic. Sealcode is not affiliated with or endorsed by Anthropic.`;

/** Open a URL in the default browser without a shell, on macOS, Linux and Windows. */
function openUrl(url: string): void {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
        : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true })
      .on('error', () => undefined)
      .unref();
  } catch {
    // The link is printed as well.
  }
}

function claudeVersion(): string | null {
  const r = spawnSync('claude', ['--version'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 10_000,
  });
  return r.status === 0 ? (r.stdout.trim().split('\n')[0] ?? null) : null;
}

export function defaultIo(): Io {
  return {
    env: process.env,
    print: (line = '') => process.stdout.write(`${line}\n`),
    fetch: globalThis.fetch,
    openUrl,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    hostname: () => hostname(),
    platform: process.platform,
    claudeVersion,
    color: !!process.stdout.isTTY && !process.env.NO_COLOR,
  };
}

export async function main(argv: string[], io: Io = defaultIo()): Promise<number> {
  const [command, ...rest] = argv;
  const flag = (name: string) => rest.includes(name);
  const option = (name: string) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const site = (option('--site') ?? io.env.SEALCODE_SITE ?? DEFAULT_SITE).replace(/\/+$/, '');
  if (!/^https?:\/\//.test(site)) {
    io.print('--site must be an http(s) URL');
    return 2;
  }
  switch (command) {
    case 'login':
      return login(io, { site, browser: !flag('--no-browser') });
    case 'doctor':
      return doctor(io, { live: flag('--live') });
    case 'logout':
      return logout(io);
    case '--version':
    case '-v':
      io.print(VERSION);
      return 0;
    default:
      io.print(HELP);
      return command && command !== 'help' && command !== '--help' && command !== '-h' ? 2 : 0;
  }
}

const invokedDirectly = process.argv[1] && /(cli\.(js|ts)|sealcode)$/.test(process.argv[1]);
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    () => {
      process.stderr.write('sealcode: unexpected error\n');
      process.exit(1);
    },
  );
}
