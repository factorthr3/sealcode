'use client';

import { useActionState } from 'react';
import { FormError, SubmitButton } from '@/components/form-controls';
import { completeSignIn, type FormState } from '../../actions';

export function VerifyForm({ token }: { token: string }) {
  const [state, action] = useActionState<FormState, FormData>(completeSignIn, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormError error={state.error} />
      <SubmitButton className="w-full" size="lg" pendingLabel="Signing in…">
        Continue to Sealcode
      </SubmitButton>
    </form>
  );
}
