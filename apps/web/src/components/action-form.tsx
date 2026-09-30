'use client';

import { useActionState } from 'react';
import { CopyButton } from './copy-button';
import { FormError, SubmitButton } from './form-controls';

export interface ActionState {
  error?: string | null;
  ok?: string | null;
  key?: string | null;
}

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

/** A form bound to a server action, showing its errors, confirmations and one-time keys. */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  className = 'space-y-4',
  submitVariant = 'primary',
  inline = false,
}: {
  action: Action;
  children?: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  submitVariant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  inline?: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  return (
    <form action={formAction} className={className}>
      {inline ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {children}
          <SubmitButton variant={submitVariant} pendingLabel={pendingLabel}>
            {submitLabel}
          </SubmitButton>
        </div>
      ) : (
        <>
          {children}
          <SubmitButton variant={submitVariant} pendingLabel={pendingLabel}>
            {submitLabel}
          </SubmitButton>
        </>
      )}
      <FormError error={state.error} />
      {state.ok && !state.key ? (
        <p role="status" className="text-sm text-verified">
          {state.ok}
        </p>
      ) : null}
      {state.key ? <KeyReveal value={state.key} note={state.ok} /> : null}
    </form>
  );
}

export function KeyReveal({ value, note }: { value: string; note?: string | null }) {
  return (
    <div role="status" className="rounded-lg border border-verified/30 bg-verified-soft p-4">
      <p className="text-sm font-medium text-verified">
        {note ?? 'Copy this key now: it won’t be shown again.'}
      </p>
      <div className="mt-3 flex items-center gap-2 rounded-md bg-code-bg px-3 py-2">
        <code className="min-w-0 flex-1 break-all font-mono text-xs text-code-ink">{value}</code>
        <CopyButton text={value} />
      </div>
    </div>
  );
}
