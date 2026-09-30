import type { Metadata } from 'next';
import Link from 'next/link';
import { claudeCodeEnv } from '@sealcode/shared';
import { CodeBlock } from '@/components/code-block';
import { ManualConnect } from '@/components/manual-connect';
import { Callout, Card, PageHeader } from '@/components/ui';
import { env } from '@/lib/env';
import { requireOrg } from '@/lib/session';
import { createKey } from '../actions';

export const metadata: Metadata = { title: 'Connect Claude Code' };

export default async function ConnectPage({ searchParams }: PageProps<'/app/connect'>) {
  const { welcome } = await searchParams;
  const { role } = await requireOrg();
  const { PUBLIC_GATEWAY_URL: gateway, PUBLIC_SITE_URL: site } = env();
  const loginCommand =
    site === 'https://sealcode.dev' ? 'npx sealcode login' : `npx sealcode login --site ${site}`;
  const snippet = JSON.stringify({ env: claudeCodeEnv(gateway, 'sc_live_…') }, null, 2);

  return (
    <>
      <PageHeader
        title="Connect Claude Code"
        description="Point Claude Code at Sealcode. Your code then goes only to our attested gateway and the model's enclave."
      />
      {welcome ? (
        <div className="mb-6">
          <Callout tone="verified" title="You're in.">
            Connect your own machine first, then invite your team.
          </Callout>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-seal">Recommended</p>
          <h2 className="mt-1 text-lg font-semibold">One command</h2>
          <p className="mt-1 text-sm text-muted">
            Opens your browser to approve the device, creates a key for it, and merges the settings
            into <code className="font-mono text-xs">~/.claude/settings.json</code>. It backs up the
            original first.
          </p>
          <div className="mt-4">
            <CodeBlock code={loginCommand} label="Terminal" />
          </div>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-ink-2">
            <li>Run the command and approve the code in your browser.</li>
            <li>
              Start <code className="font-mono text-xs">claude</code> as usual.{' '}
              <code className="font-mono text-xs">/status</code> shows the Sealcode base URL.
            </li>
            <li>
              If anything looks off, <code className="font-mono text-xs">npx sealcode doctor</code>{' '}
              checks for conflicts.
            </li>
          </ol>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold">Manual setup</h2>
          <p className="mt-1 text-sm text-muted">
            Create a key for this device, then add the{' '}
            <code className="font-mono text-xs">env</code> block to{' '}
            <code className="font-mono text-xs">~/.claude/settings.json</code>. Never put it in a
            project&rsquo;s <code className="font-mono text-xs">.claude/settings.json</code>, which
            is committed.
          </p>
          <div className="mt-4">
            {role === 'billing' ? (
              <>
                <p className="mb-4 text-sm text-muted">
                  Billing members don&rsquo;t hold API keys.
                </p>
                <CodeBlock code={snippet} label="~/.claude/settings.json" />
              </>
            ) : (
              <ManualConnect action={createKey} gatewayUrl={gateway} />
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-6">
        <h2 className="font-semibold">Other clients and strict networks</h2>
        <ul className="mt-3 space-y-2 text-sm text-ink-2">
          <li>
            OpenCode, Cline and Continue use the OpenAI-compatible endpoint{' '}
            <code className="font-mono text-xs">{gateway}/v1</code> with models{' '}
            <code className="font-mono text-xs">sealcode-pro</code> and{' '}
            <code className="font-mono text-xs">sealcode-fast</code>.{' '}
            <Link href="/docs" className="text-seal hover:underline">
              Quickstarts →
            </Link>
          </li>
          <li>
            <code className="font-mono text-xs">CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1</code>{' '}
            stops Claude Code&rsquo;s telemetry and update checks. Its WebFetch tool still checks
            domains with <code className="font-mono text-xs">api.anthropic.com</code>. If your
            egress rules block that host, add{' '}
            <code className="font-mono text-xs">&quot;skipWebFetchPreflight&quot;: true</code> to
            your settings.
          </li>
        </ul>
      </Card>
    </>
  );
}
