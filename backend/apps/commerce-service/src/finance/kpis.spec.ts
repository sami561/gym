import { ExpenseCategory, SaleStatus } from '@app/common';
import { computeCommerceKpis, KpiSale } from './kpis';
import { monthKeysBetween } from '../shared/periods';

const sale = (overrides: Partial<KpiSale>): KpiSale => ({
  month: '2026-11',
  status: SaleStatus.COMPLETED,
  subtotal: 0,
  discount: 0,
  total: 0,
  items: [],
  ...overrides,
});

describe('commerce KPIs (GMV / NMV / margin, shop side)', () => {
  const months = ['2026-09', '2026-10', '2026-11'];

  it('nets discounts and refunds out of gross and margins the kept sales', () => {
    const kpis = computeCommerceKpis(
      months,
      [
        // kept: 2 × Whey (cost 60) + 3 × water (unknown cost), 9.9 discount
        sale({ subtotal: 183.4, discount: 9.9, total: 173.5, items: [{ quantity: 2, unitCost: 60 }, { quantity: 3, unitCost: null }] }),
        // refunded: counts in gross/discounts/refunds, never in COGS
        sale({ status: SaleStatus.REFUNDED, subtotal: 100, discount: 10, total: 90, items: [{ quantity: 1, unitCost: 40 }] }),
        // October, older sale stored before costs were captured (no unitCost key)
        sale({ month: '2026-10', subtotal: 30, total: 30, items: [{ quantity: 1 }] }),
      ],
      [],
    );
    expect(kpis.gross).toBe(313.4);
    expect(kpis.discounts).toBe(19.9);
    expect(kpis.refunds).toBe(90);
    expect(kpis.net).toBe(203.5); // = 173.5 + 30, the cash actually kept
    expect(kpis.cogs).toBe(120);
    expect(kpis.grossMargin).toBe(83.5);
    expect(kpis.itemsWithoutCost).toBe(2);
  });

  it('a fully refunded sale nets to zero', () => {
    const kpis = computeCommerceKpis(
      ['2026-11'],
      [sale({ status: SaleStatus.REFUNDED, subtotal: 50, discount: 5, total: 45, items: [{ quantity: 1, unitCost: 20 }] })],
      [],
    );
    expect(kpis).toMatchObject({ gross: 50, discounts: 5, refunds: 45, net: 0, cogs: 0, grossMargin: 0, itemsWithoutCost: 0 });
  });

  it('includes every month of the range, with zeros when nothing happened', () => {
    const kpis = computeCommerceKpis(months, [sale({ subtotal: 10, total: 10, items: [{ quantity: 2, unitCost: 1.25 }] })], [
      { month: '2026-09', category: ExpenseCategory.RENT, amount: 1500 },
    ]);
    expect(kpis.monthly).toEqual([
      { month: '2026-09', gross: 0, discounts: 0, refunds: 0, net: 0, cogs: 0, expenses: 1500 },
      { month: '2026-10', gross: 0, discounts: 0, refunds: 0, net: 0, cogs: 0, expenses: 0 },
      { month: '2026-11', gross: 10, discounts: 0, refunds: 0, net: 10, cogs: 2.5, expenses: 0 },
    ]);
  });

  it('totals expenses and sorts categories by amount, skipping empty ones', () => {
    const kpis = computeCommerceKpis(months, [], [
      { month: '2026-10', category: ExpenseCategory.SALARY, amount: 1450.5 },
      { month: '2026-11', category: ExpenseCategory.SALARY, amount: 1450.5 },
      { month: '2026-11', category: ExpenseCategory.MAINTENANCE, amount: 120.1 },
      { month: '2026-11', category: ExpenseCategory.OTHER, amount: 0 },
      { month: '2025-01', category: ExpenseCategory.RENT, amount: 999 }, // outside the range
    ]);
    expect(kpis.expenses).toBe(3021.1);
    expect(kpis.expensesByCategory).toEqual([
      { category: ExpenseCategory.SALARY, total: 2901 },
      { category: ExpenseCategory.MAINTENANCE, total: 120.1 },
    ]);
  });

  it('lists the months touched by a date range', () => {
    expect(monthKeysBetween('2026-09-15', '2026-11-02')).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(monthKeysBetween('2025-12-31', '2026-01-01')).toEqual(['2025-12', '2026-01']);
    expect(monthKeysBetween('2026-11-01', '2026-11-30')).toEqual(['2026-11']);
  });
});
