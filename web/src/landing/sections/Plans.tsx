import { Check } from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '../../lib/i18n';
import { FALLBACK_PLANS, type FallbackPlan } from '../../lib/fallbacks';
import { Skeleton } from '../../components/ui/Spinner';
import { usePublicPlans } from '../useLandingData';
import { currencySymbol, formatInt } from '../../lib/format';

function durationLabel(days: number, t: ReturnType<typeof useI18n>['t']): string {
  if (days >= 360 && days <= 366) return t('plans.year');
  if (days >= 28 && days <= 31) return t('plans.month');
  if (days % 30 === 0 && days > 30) return `${days / 30} ${t('plans.months')}`;
  return `${days} ${t('plans.days')}`;
}

function Price({ value, onSite }: { value: number | null; onSite: string }) {
  if (value === null) return <p className="type-wide text-2xl text-white">{onSite}</p>;
  const [whole, millimes] = value.toFixed(3).split('.');
  return (
    <p className="flex items-baseline gap-1 text-white" dir="ltr">
      <span className="type-display text-6xl tabular">{formatInt(Number(whole))}</span>
      <span className="text-lg font-semibold text-steel-300">
        ,{millimes} {currencySymbol()}
      </span>
    </p>
  );
}

export function Plans({ onChoose }: { onChoose: (planId: string | null) => void }) {
  const { t } = useI18n();
  const query = usePublicPlans();
  const plans: FallbackPlan[] =
    query.data && query.data.length > 0
      ? [...query.data].filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.durationDays - b.durationDays)
      : FALLBACK_PLANS;
  const offline = !query.isLoading && (!query.data || query.data.length === 0);

  return (
    <section id="offres" className="bg-shield py-24 text-white sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 className="type-display text-5xl sm:text-6xl">{t('plans.title')}</h2>
          <p className="max-w-md text-steel-300">{offline ? t('plans.offline') : t('plans.lead')}</p>
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl bg-white/12 ring-1 ring-white/12 md:grid-cols-2 lg:grid-cols-3">
          {query.isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-steel-950 p-8">
                  <Skeleton className="h-6 w-32 bg-white/10" />
                  <Skeleton className="mt-6 h-14 w-48 bg-white/10" />
                  <Skeleton className="mt-8 h-24 w-full bg-white/10" />
                </div>
              ))
            : plans.map((plan) => (
                <article
                  key={plan.id}
                  className={clsx('relative flex flex-col p-8 sm:p-10', plan.isFeatured ? 'bg-steel-900' : 'bg-steel-950')}
                >
                  {plan.isFeatured && <span className="absolute inset-x-0 top-0 h-1 bg-brand-500" aria-hidden />}
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="type-wide text-2xl">{plan.name}</h3>
                    <span className="text-sm text-steel-400">{durationLabel(plan.durationDays, t)}</span>
                  </div>
                  {plan.isFeatured && <p className="mt-2 text-sm font-semibold text-brand-400">{t('plans.featured')}</p>}
                  <div className="mt-8">
                    <Price value={plan.price} onSite={t('plans.priceOnSite')} />
                  </div>
                  {plan.description && <p className="mt-4 text-steel-300">{plan.description}</p>}
                  <ul className="mt-8 flex flex-1 flex-col gap-3 border-t border-white/10 pt-6">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-3 text-sm text-steel-200">
                        <Check className="mt-0.5 size-4 shrink-0 text-led" aria-hidden />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => onChoose(plan.id.startsWith('fallback-') ? null : plan.id)}
                    className={clsx(
                      'mt-10 h-12 rounded-lg font-semibold transition-[background-color,transform] active:scale-[0.98]',
                      plan.isFeatured ? 'bg-brand-500 text-white hover:bg-brand-600' : 'text-white ring-1 ring-white/30 hover:bg-white/10',
                    )}
                  >
                    {t('plans.cta')}
                  </button>
                </article>
              ))}
          {!query.isLoading &&
            Array.from({ length: (3 - (plans.length % 3)) % 3 }).map((_, i) => <div key={`fill-lg-${i}`} className="hidden bg-steel-950 lg:block" aria-hidden />)}
          {!query.isLoading && plans.length % 2 === 1 && <div className="hidden bg-steel-950 md:block lg:hidden" aria-hidden />}
        </div>
      </div>
    </section>
  );
}
