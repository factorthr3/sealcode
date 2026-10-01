import {
  formatTokens,
  formatUsd,
  PAID_PLAN_IDS,
  PLANS,
  SHOW_PUBLIC_PRICES,
} from '@sealcode/shared';
import { ButtonLink } from './ui';

/**
 * Plan cards from the shared plan config that billing statements use. Team and Business show list
 * prices; Enterprise is priced with each customer. Every call to action goes to sales.
 */
export function PricingCards({ compact = false }: { compact?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {PAID_PLAN_IDS.map((id) => {
        const plan = PLANS[id];
        const featured = plan.highlighted;
        const listed = SHOW_PUBLIC_PRICES && plan.pricePerSeatMonthly !== null;
        return (
          <div
            key={id}
            className={`relative flex flex-col rounded-2xl border p-6 sm:p-7 ${
              featured
                ? 'border-seal bg-surface shadow-[0_30px_70px_-40px_rgba(185,58,11,0.55)]'
                : 'border-line bg-surface'
            }`}
          >
            {featured ? (
              <span className="absolute -top-3 left-6 rounded-full bg-seal px-3 py-1 text-xs font-medium text-white dark:text-[#140a05]">
                For regulated teams
              </span>
            ) : null}
            <h3 className="font-display text-3xl">{plan.name}</h3>
            <p className="mt-1 text-sm text-muted">{plan.tagline}</p>
            <div className="mt-6">
              {listed ? (
                <>
                  <p>
                    <span className="text-4xl font-semibold tracking-tight">
                      {formatUsd(plan.pricePerSeatMonthly!)}
                    </span>
                    <span className="text-sm text-muted"> per seat / month</span>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {plan.minSeats}-seat minimum
                    {plan.includedTokensPerSeat
                      ? ` · ${formatTokens(plan.includedTokensPerSeat)} tokens per seat, pooled`
                      : ''}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-semibold tracking-tight">
                    {plan.pricePerSeatMonthly === null ? 'Priced with you' : 'Pricing on request'}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {plan.pricePerSeatMonthly === null
                      ? 'Agreed for your organisation’s size and needs.'
                      : 'Per seat, with a pooled monthly token allowance.'}
                  </p>
                </>
              )}
            </div>
            {!compact ? (
              <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden className="text-verified">
                      ✓
                    </span>
                    <span className="text-ink-2">{f}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex-1" />
            )}
            <div className="mt-7 grid gap-2">
              <ButtonLink
                href={`/contact?plan=${id}${plan.pricePerSeatMonthly !== null ? `&seats=${plan.minSeats}` : ''}&reason=pricing`}
                variant={featured ? 'primary' : 'secondary'}
              >
                {id === 'enterprise' ? 'Talk to us about pricing' : `Get ${plan.name}`}
              </ButtonLink>
            </div>
          </div>
        );
      })}
    </div>
  );
}
