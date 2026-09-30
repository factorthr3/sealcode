'use client';

import { useActionState } from 'react';
import { claudeCodeEnv } from '@sealcode/shared';
import type { ActionState } from './action-form';
import { CopyButton } from './copy-button';
import { FormError, SubmitButton } from './form-controls';
import { Field, inputClass } from './ui';

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

/** Create a key and show the complete settings snippet with it filled in, once. */
export function ManualConnect({ action, gatewayUrl }: { action: Action; gatewayUrl: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const snippet = JSON.stringify(
    { env: claudeCodeEnv(gatewayUrl, state.key ?? 'sc_live_…') },
    null,
    2,
  );
  return (
    <div className="space-y-4">
      <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Device name">
            <input
              name="name"
              required
              maxLength={80}
              placeholder="work-laptop"
              className={inputClass}
            />
          </Field>
        </div>
        <SubmitButton pendingLabel="Creating…">Create key</SubmitButton>
      </form>
      <FormError error={state.error} />
      {state.key ? (
        <p role="status" className="text-sm font-medium text-verified">
          Key created and filled in below. Copy the snippet now: the key won&rsquo;t be shown again.
        </p>
      ) : null}
      <div
        className={`overflow-hidden rounded-lg border bg-code-bg text-code-ink ${state.key ? 'border-verified/60' : 'border-black/10'}`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
          <span className="font-mono text-xs text-code-muted">~/.claude/settings.json</span>
          <CopyButton text={snippet} />
        </div>
        <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
          <code>{snippet}</code>
        </pre>
      </div>
    </div>
  );
}
