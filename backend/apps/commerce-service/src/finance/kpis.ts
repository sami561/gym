import { CommerceKpis, ExpenseCategory, SaleStatus } from '@app/common';
import { fromMillimes, toMillimes } from '../shared/money';

/** A sale as needed by the KPI maths; `month` is its YYYY-MM in the gym timezone. */
export interface KpiSale {
  month: string;
  status: SaleStatus;
  subtotal: number;
  discount: number;
  total: number;
  items: { quantity: number; unitCost?: number | null }[];
}

/** Expenses summed per month and category. */
export interface KpiExpense {
  month: string;
  category: ExpenseCategory;
  amount: number;
}

/** CommerceKpis plus the number of sold lines whose cost was unknown (counted as 0 in COGS). */
export interface CommerceKpisResult extends CommerceKpis {
  itemsWithoutCost: number;
}

interface MonthAccumulator {
  gross: number;
  discounts: number;
  refunds: number;
  cogs: number;
  expenses: number;
}

/**
 * Shop side of GMV / NMV / margin, in millimes to stay exact. Sales count in the month they were made:
 *   gross = subtotals (refunded sales included), refunds = totals of refunded sales,
 *   net = gross − discounts − refunds (= totals of the sales that were kept),
 *   cogs = Σ unitCost × quantity of kept sales, grossMargin = net − cogs.
 * Every month in `months` appears in `monthly`, with zeros when nothing happened.
 */
export function computeCommerceKpis(months: string[], sales: KpiSale[], expenses: KpiExpense[]): CommerceKpisResult {
  const byMonth = new Map<string, MonthAccumulator>(
    months.map((month) => [month, { gross: 0, discounts: 0, refunds: 0, cogs: 0, expenses: 0 }]),
  );
  const byCategory = new Map<ExpenseCategory, number>();
  let itemsWithoutCost = 0;

  for (const sale of sales) {
    const bucket = byMonth.get(sale.month);
    if (!bucket) continue;
    bucket.gross += toMillimes(sale.subtotal);
    bucket.discounts += toMillimes(sale.discount);
    if (sale.status === SaleStatus.REFUNDED) {
      bucket.refunds += toMillimes(sale.total);
      continue;
    }
    for (const item of sale.items ?? []) {
      if (item.unitCost === null || item.unitCost === undefined) {
        itemsWithoutCost += 1;
        continue;
      }
      bucket.cogs += toMillimes(item.unitCost) * item.quantity;
    }
  }

  for (const expense of expenses) {
    const bucket = byMonth.get(expense.month);
    if (!bucket) continue;
    const amount = toMillimes(expense.amount);
    bucket.expenses += amount;
    byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + amount);
  }

  const total: MonthAccumulator = { gross: 0, discounts: 0, refunds: 0, cogs: 0, expenses: 0 };
  const monthly = months.map((month) => {
    const bucket = byMonth.get(month)!;
    (Object.keys(total) as (keyof MonthAccumulator)[]).forEach((key) => (total[key] += bucket[key]));
    const net = bucket.gross - bucket.discounts - bucket.refunds;
    return {
      month,
      gross: fromMillimes(bucket.gross),
      discounts: fromMillimes(bucket.discounts),
      refunds: fromMillimes(bucket.refunds),
      net: fromMillimes(net),
      cogs: fromMillimes(bucket.cogs),
      expenses: fromMillimes(bucket.expenses),
    };
  });

  const net = total.gross - total.discounts - total.refunds;
  return {
    gross: fromMillimes(total.gross),
    discounts: fromMillimes(total.discounts),
    refunds: fromMillimes(total.refunds),
    net: fromMillimes(net),
    cogs: fromMillimes(total.cogs),
    grossMargin: fromMillimes(net - total.cogs),
    expenses: fromMillimes(total.expenses),
    expensesByCategory: [...byCategory]
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount]) => ({ category, total: fromMillimes(amount) })),
    monthly,
    itemsWithoutCost,
  };
}
