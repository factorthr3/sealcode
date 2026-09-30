'use client';

import { useState } from 'react';

interface Summary {
  verified: boolean;
  required: boolean | null;
  provider: string | null;
  modelId: string | null;
  sessionId: string | null;
  servedAt: string | null;
  workloadId: string | null;
  signed: boolean;
  events: { type: string }[];
}

export function ReceiptButton({ receiptId }: { receiptId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'done'>('idle');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [raw, setRaw] = useState<string>('');

  async function verify() {
    setState('loading');
    try {
      const res = await fetch(`/api/receipts/${encodeURIComponent(receiptId)}`);
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { summary: Summary; receipt: unknown };
      setSummary(body.summary);
      setRaw(JSON.stringify(body.receipt, null, 2));
      setState('done');
    } catch {
      setState('error');
    }
  }

  if (state === 'done' && summary) {
    return (
      <details className="text-xs" open>
        <summary
          className={`cursor-pointer font-medium ${summary.verified ? 'text-verified' : 'text-danger'}`}
        >
          {summary.verified ? '✓ upstream.verified' : '✗ not verified'}
          {summary.required ? ' (required)' : ''}
        </summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink-2">
          <dt className="text-muted">Provider</dt>
          <dd>{summary.provider ?? '—'}</dd>
          <dt className="text-muted">Model</dt>
          <dd className="font-mono">{summary.modelId ?? '—'}</dd>
          <dt className="text-muted">Session</dt>
          <dd className="truncate font-mono">{summary.sessionId ?? '—'}</dd>
          <dt className="text-muted">Signed</dt>
          <dd>{summary.signed ? 'Yes' : 'No'}</dd>
        </dl>
        <details className="mt-2">
          <summary className="cursor-pointer text-muted">Raw receipt</summary>
          <pre className="mt-1 max-h-64 max-w-md overflow-auto rounded bg-code-bg p-2 font-mono text-[11px] text-code-ink">
            {raw}
          </pre>
        </details>
      </details>
    );
  }
  return (
    <button
      type="button"
      onClick={verify}
      disabled={state === 'loading'}
      className="text-xs font-medium text-seal hover:underline disabled:opacity-60"
    >
      {state === 'loading' ? 'Verifying…' : state === 'error' ? 'Retry verify' : 'Verify'}
    </button>
  );
}
