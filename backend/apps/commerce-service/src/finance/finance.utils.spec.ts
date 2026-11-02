import { buildFinanceMonths } from './finance.utils';
import { monthKeysBack } from '../shared/periods';

describe('finance month merge', () => {
  it('merges membership revenue, sales and expenses per month with 0 for gaps', () => {
    const months = buildFinanceMonths(
      ['2026-09', '2026-10', '2026-11'],
      [
        { month: '2026-09', total: 1200, count: 10 },
        { month: '2026-11', total: 450.5, count: 4 },
        { month: '2025-01', total: 999, count: 1 }, // outside the window, ignored
      ],
      { '2026-10': 80.25, '2026-11': 19.75 },
      { '2026-09': 1500, '2026-11': 100.1 },
    );
    expect(months).toEqual([
      { month: '2026-09', membershipRevenue: 1200, salesRevenue: 0, expenses: 1500, profit: -300 },
      { month: '2026-10', membershipRevenue: 0, salesRevenue: 80.25, expenses: 0, profit: 80.25 },
      { month: '2026-11', membershipRevenue: 450.5, salesRevenue: 19.75, expenses: 100.1, profit: 370.15 },
    ]);
  });

  it('builds month keys oldest first ending with the current month', () => {
    expect(monthKeysBack(3, new Date(2026, 0, 15))).toEqual(['2025-11', '2025-12', '2026-01']);
    expect(monthKeysBack(1, new Date(2026, 10, 2))).toEqual(['2026-11']);
  });
});
