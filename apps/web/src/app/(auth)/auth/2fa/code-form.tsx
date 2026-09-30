'use client';

import { useActionState } from 'react';
import { FormError, SubmitButton } from '@/components/form-controls';
import { Field, inputClass } from '@/components/ui';
import { verifyTwoFactor, type FormState } from '../../actions';

export function CodeForm({ next, label }: { next: string; label: string }) {
  const [state, action] = useActionState<FormState, FormData>(verifyTwoFactor, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="6-digit code">
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          autoFocus
          placeholder="123 456"
          className={`${inputClass} font-mono text-lg tracking-[0.3em]`}
        />
      </Field>
      <FormError error={state.error} />
      <SubmitButton className="w-full" pendingLabel="Checking…">
        {label}
      </SubmitButton>
    </form>
  );
}
