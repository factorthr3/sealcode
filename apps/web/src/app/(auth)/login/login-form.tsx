'use client';

import { useActionState } from 'react';
import { FormError, SubmitButton } from '@/components/form-controls';
import { Field, inputClass } from '@/components/ui';
import { requestMagicLink, type FormState } from '../actions';

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<FormState, FormData>(requestMagicLink, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? '/app'} />
      <Field label="Work email">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          placeholder="you@company.com"
          className={inputClass}
        />
      </Field>
      <FormError error={state.error} />
      <SubmitButton className="w-full" pendingLabel="Sending link…">
        Email me a sign-in link
      </SubmitButton>
    </form>
  );
}
