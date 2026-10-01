'use client';

import { useActionState } from 'react';
import { PAID_PLAN_IDS, PLANS } from '@sealcode/shared';
import { FormError, SubmitButton } from '@/components/form-controls';
import { Field, inputClass } from '@/components/ui';
import { submitEnquiry, type ContactState } from './actions';
import { REASONS, TEAM_SIZES } from './options';

export function ContactForm({
  defaults,
}: {
  defaults: { plan?: string; seats?: string; reason?: string; email?: string; company?: string };
}) {
  const [state, action] = useActionState<ContactState, FormData>(submitEnquiry, {});
  const fe = state.fieldErrors ?? {};
  if (state.sent) {
    return (
      <div role="status" className="rounded-xl border border-verified/30 bg-verified-soft p-8">
        <p className="font-display text-3xl text-ink">Thanks. We&rsquo;ll be in touch.</p>
        <p className="mt-2 text-sm text-ink-2">
          We reply within one working day, and we&rsquo;ve emailed you a copy. Until then, the
          playground on our homepage is yours to use.
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-5" noValidate>
      <div className="hidden" aria-hidden>
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Your name" error={fe.name}>
          <input name="name" required autoComplete="name" className={inputClass} />
        </Field>
        <Field label="Work email" error={fe.email}>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={defaults.email}
            className={inputClass}
          />
        </Field>
        <Field label="Company" error={fe.company}>
          <input
            name="company"
            required
            autoComplete="organization"
            defaultValue={defaults.company}
            className={inputClass}
          />
        </Field>
        <Field label="Engineers" error={fe.teamSize}>
          <select name="teamSize" defaultValue="11–50" className={inputClass}>
            {TEAM_SIZES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="What can we help with?" error={fe.reason}>
          <select
            name="reason"
            defaultValue={
              defaults.reason && defaults.reason in REASONS ? defaults.reason : 'pricing'
            }
            className={inputClass}
          >
            {Object.entries(REASONS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Plan" error={fe.plan}>
          <select
            name="plan"
            defaultValue={
              defaults.plan && (PAID_PLAN_IDS as string[]).includes(defaults.plan)
                ? defaults.plan
                : 'unsure'
            }
            className={inputClass}
          >
            {PAID_PLAN_IDS.map((id) => (
              <option key={id} value={id}>
                {PLANS[id].name}
              </option>
            ))}
            <option value="unsure">Not sure yet</option>
          </select>
        </Field>
        <Field label="Seats (optional)" error={fe.seats}>
          <input
            name="seats"
            type="number"
            min={1}
            inputMode="numeric"
            defaultValue={defaults.seats}
            className={inputClass}
          />
        </Field>
      </div>
      <Field
        label="Anything else? (optional)"
        hint="Procurement steps, security questionnaires, target start date."
        error={fe.message}
      >
        <textarea name="message" rows={4} maxLength={4000} className={inputClass} />
      </Field>
      <FormError error={state.error} />
      <SubmitButton size="lg" pendingLabel="Sending…">
        Send
      </SubmitButton>
      <p className="text-xs text-muted">
        We use these details only to reply and to set up your account. See our{' '}
        <a href="/legal/privacy" className="underline">
          privacy policy
        </a>
        .
      </p>
    </form>
  );
}
