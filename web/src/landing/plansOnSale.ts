import type { PlanDto } from '../api/types';
import { FALLBACK_PLANS, type FallbackPlan } from '../lib/fallbacks';

/**
 * What the "Pick your pace" section shows. Any answer of the API wins, even an empty one (nothing on sale
 * right now); the price-less fallback plans only stand in while the API has never answered. A failed
 * refetch keeps the last answer (TanStack Query keeps `data`), so it never brings the fallback back.
 */
export function plansOnSale(answer: PlanDto[] | undefined): { plans: FallbackPlan[]; fromApi: boolean } {
  if (!answer) return { plans: FALLBACK_PLANS, fromApi: false };
  const plans = answer.filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.durationDays - b.durationDays);
  return { plans, fromApi: true };
}
