import { FinanceMonth, RevenuePoint } from '@app/common';
import { fromMillimes, toMillimes } from '../shared/money';

/**
 * One FinanceMonth per key (oldest first): membership revenue (from membership-service),
 * completed shop sales and expenses; profit = revenue - expenses. Missing months count as 0.
 */
export function buildFinanceMonths(
  keys: string[],
  membership: RevenuePoint[],
  salesByMonth: Record<string, number>,
  expensesByMonth: Record<string, number>,
): FinanceMonth[] {
  const membershipByMonth = new Map<string, number>();
  for (const point of membership) {
    membershipByMonth.set(point.month, (membershipByMonth.get(point.month) ?? 0) + toMillimes(Number(point.total) || 0));
  }
  return keys.map((month) => {
    const membershipRevenue = membershipByMonth.get(month) ?? 0;
    const salesRevenue = toMillimes(salesByMonth[month] ?? 0);
    const expenses = toMillimes(expensesByMonth[month] ?? 0);
    return {
      month,
      membershipRevenue: fromMillimes(membershipRevenue),
      salesRevenue: fromMillimes(salesRevenue),
      expenses: fromMillimes(expenses),
      profit: fromMillimes(membershipRevenue + salesRevenue - expenses),
    };
  });
}

export function emptyFinanceMonth(month: string): FinanceMonth {
  return { month, membershipRevenue: 0, salesRevenue: 0, expenses: 0, profit: 0 };
}
