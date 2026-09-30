'use client';

import { useActionState } from 'react';
import { FormError, SubmitButton } from '@/components/form-controls';
import { Field, inputClass } from '@/components/ui';
import { requestMagicLink, type FormState } from '../actions';

export function LoginForm({ next, withCompany = false }: { next?: string; withCompany?: boolean }) {
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
      {withCompany ? (
        <Field label="Company or team" hint="You can rename it later.">
          <input
            name="company"
            required
            minLength={2}
            maxLength={120}
            autoComplete="organization"
            placeholder="Acme Payments"
            className={inputClass}
          />
        </Field>
      ) : null}
      <FormError error={state.error} />
      <SubmitButton className="w-full" pendingLabel="Sending link…">
        {withCompany ? 'Start free trial' : 'Email me a sign-in link'}
      </SubmitButton>
    </form>
  );
}
