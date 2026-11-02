import { CommerceKpis, FinanceKpis, MembershipKpis } from '@app/common';

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

/** Combines the membership and shop halves into GMV / NMV / margins (see docs/API.md). */
export function combineKpis(
  from: string,
  to: string,
  memberships: MembershipKpis | null,
  shop: CommerceKpis | null,
): FinanceKpis {
  const m = memberships;
  const s = shop;
  const gmv = round3((m?.gross ?? 0) + (s?.gross ?? 0));
  const discounts = round3((m?.discounts ?? 0) + (s?.discounts ?? 0));
  const refunds = round3(s?.refunds ?? 0);
  const cancellations = round3(m?.cancelled ?? 0);
  const nmv = round3(gmv - discounts - refunds - cancellations);
  const cogs = round3(s?.cogs ?? 0);
  const expenses = round3(s?.expenses ?? 0);
  const grossMargin = round3(nmv - cogs);
  const operatingProfit = round3(grossMargin - expenses);

  const months = new Map<string, { gmv: number; nmv: number; cogs: number; expenses: number }>();
  const bucket = (month: string) => {
    if (!months.has(month)) months.set(month, { gmv: 0, nmv: 0, cogs: 0, expenses: 0 });
    return months.get(month)!;
  };
  for (const row of m?.monthly ?? []) {
    const b = bucket(row.month);
    b.gmv += row.gross;
    b.nmv += row.net;
  }
  for (const row of s?.monthly ?? []) {
    const b = bucket(row.month);
    b.gmv += row.gross;
    b.nmv += row.net;
    b.cogs += row.cogs;
    b.expenses += row.expenses;
  }

  return {
    from,
    to,
    gmv,
    discounts,
    refunds,
    cancellations,
    nmv,
    cashCollected: round3((m?.cashCollected ?? 0) + (s?.net ?? 0)),
    cogs,
    grossMargin,
    grossMarginPct: pct(grossMargin, nmv),
    expenses,
    operatingProfit,
    operatingMarginPct: pct(operatingProfit, nmv),
    mrr: m?.mrr ?? 0,
    arpu: m?.arpu ?? 0,
    activeMembers: m?.activeMembers ?? 0,
    breakdown: { memberships, shop },
    monthly: [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, b]) => {
        const profit = round3(b.nmv - b.cogs - b.expenses);
        return { month, gmv: round3(b.gmv), nmv: round3(b.nmv), expenses: round3(b.expenses), profit, marginPct: pct(profit, b.nmv) };
      }),
  };
}
