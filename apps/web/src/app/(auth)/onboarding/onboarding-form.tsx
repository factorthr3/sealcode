'use client';

import { useActionState } from 'react';
import { FormError, SubmitButton } from '@/components/form-controls';
import { Field, inputClass } from '@/components/ui';
import { createOrganisation, type FormState } from '../actions';

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const [state, action] = useActionState<FormState, FormData>(createOrganisation, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Company or team name">
        <input
          name="name"
          required
          minLength={2}
          maxLength={120}
          defaultValue={defaultName}
          autoFocus
          className={inputClass}
        />
      </Field>
      <FormError error={state.error} />
      <SubmitButton className="w-full" pendingLabel="Creating…">
        Create organisation and start trial
      </SubmitButton>
    </form>
  );
}
