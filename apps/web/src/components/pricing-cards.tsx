import { formatTokens, formatUsd, PAID_PLAN_IDS, PLANS, TRIAL } from '@sealcode/shared';
import { ButtonLink } from './ui';

/** Plan cards, straight from the shared plan config that billing statements use. */
export function PricingCards({ compact = false }: { compact?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {PAID_PLAN_IDS.map((id) => {
        const plan = PLANS[id];
        const featured = plan.highlighted;
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
              {plan.pricePerSeatMonthly !== null ? (
                <p>
                  <span className="text-4xl font-semibold tracking-tight">
                    {formatUsd(plan.pricePerSeatMonthly)}
                  </span>
                  <span className="text-sm text-muted"> per seat / month</span>
                </p>
              ) : (
                <p>
                  <span className="text-sm text-muted">From </span>
                  <span className="text-4xl font-semibold tracking-tight">
                    {formatUsd(plan.platformFeeMonthly ?? 0)}
                  </span>
                  <span className="text-sm text-muted"> / month platform fee, plus seats</span>
                </p>
              )}
              <p className="mt-1 text-xs text-muted">
                {plan.minSeats}-seat minimum ·{' '}
                {plan.includedTokensPerSeat
                  ? `${formatTokens(plan.includedTokensPerSeat)} tokens per seat, pooled`
                  : 'custom token allowance'}
              </p>
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
              {id === 'enterprise' ? (
                <ButtonLink
                  href={`/contact?plan=${id}&reason=activation`}
                  variant={featured ? 'primary' : 'secondary'}
                >
                  Talk to us
                </ButtonLink>
              ) : (
                <>
                  <ButtonLink href="/signup" variant={featured ? 'primary' : 'secondary'}>
                    Start {TRIAL.days}-day free trial
                  </ButtonLink>
                  <ButtonLink
                    href={`/contact?plan=${id}&seats=${plan.minSeats}&reason=activation`}
                    variant="ghost"
                    size="sm"
                  >
                    Buy {plan.name} →
                  </ButtonLink>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
