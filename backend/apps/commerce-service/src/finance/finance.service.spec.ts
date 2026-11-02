import { BadRequestException, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ExpenseCategory, PATTERNS, RpcClient, RpcError, SaleStatus } from '@app/common';
import { Sale } from '../sales/sale.entity';
import { Expense } from '../expenses/expense.entity';
import { Product } from '../products/product.entity';
import { FinanceService } from './finance.service';

/** Query builder double: every chained call returns itself; the terminal calls are stubbed per test. */
function queryBuilder(result: { getRawOne?: unknown; getCount?: number }) {
  const qb: Record<string, jest.Mock> = {};
  for (const method of ['select', 'where', 'andWhere']) qb[method] = jest.fn(() => qb);
  qb.getRawOne = jest.fn().mockResolvedValue(result.getRawOne);
  qb.getCount = jest.fn().mockResolvedValue(result.getCount ?? 0);
  return qb;
}

describe('FinanceService (shop side of the KPIs)', () => {
  const sales = { query: jest.fn(), createQueryBuilder: jest.fn() };
  const expenses = { query: jest.fn(), createQueryBuilder: jest.fn() };
  const products = { createQueryBuilder: jest.fn() };
  const rpc = { send: jest.fn() };
  const service = new FinanceService(
    sales as unknown as Repository<Sale>,
    expenses as unknown as Repository<Expense>,
    products as unknown as Repository<Product>,
    rpc as unknown as RpcClient,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: new Date(2026, 10, 15, 10, 30) }); // 15 Nov 2026, 10:30 in Tunis
  });
  afterEach(() => jest.useRealTimers());

  describe('kpis', () => {
    it('validates the period before querying', async () => {
      await expect(service.kpis({ from: '2026-11-10', to: '2026-11-01' })).rejects.toThrow(
        new BadRequestException('La date de début doit précéder la date de fin.'),
      );
      await expect(service.kpis({ from: '01/11/2026' })).rejects.toThrow(
        'La date de début doit être une date au format AAAA-MM-JJ.',
      );
      await expect(service.kpis({ to: 'demain' })).rejects.toThrow('La date de fin doit être une date au format AAAA-MM-JJ.');
      await expect(service.kpis({ from: '2021-12-01', to: '2026-12-31' })).rejects.toThrow(
        'Période trop longue (60 mois maximum).',
      );
      expect(sales.query).not.toHaveBeenCalled();
    });

    it('accepts exactly 60 months', async () => {
      sales.query.mockResolvedValue([]);
      expenses.query.mockResolvedValue([]);
      const kpis = await service.kpis({ from: '2022-01-01', to: '2026-12-31' });
      expect(kpis.monthly).toHaveLength(60);
    });

    it('queries whole gym days and computes GMV, NMV and margin from the rows', async () => {
      sales.query.mockResolvedValue([
        {
          month: '2026-11',
          status: SaleStatus.COMPLETED,
          subtotal: '120.000',
          discount: '20.000',
          total: '100.000',
          items: [{ quantity: 2, unitCost: 30 }],
        },
        { month: '2026-11', status: SaleStatus.REFUNDED, subtotal: '50.000', discount: '0.000', total: '50.000', items: null },
      ]);
      expenses.query.mockResolvedValue([{ month: '2026-11', category: ExpenseCategory.RENT, amount: '1500.000' }]);

      const kpis = await service.kpis({ from: '2026-11-01T10:00:00.000Z', to: '2026-11-30T22:00:00.000Z' });

      const [, salesParams] = sales.query.mock.calls[0];
      expect(salesParams[0]).toBe(process.env.TZ || 'Africa/Tunis');
      expect((salesParams[1] as Date).toISOString()).toBe('2026-10-31T23:00:00.000Z'); // 1 Nov, 00:00 in Tunis
      expect((salesParams[2] as Date).toISOString()).toBe('2026-11-30T23:00:00.000Z'); // 1 Dec, 00:00 in Tunis
      expect(expenses.query.mock.calls[0][1]).toEqual(['2026-11-01', '2026-11-30']);
      expect(kpis).toMatchObject({
        gross: 170,
        discounts: 20,
        refunds: 50,
        net: 100,
        cogs: 60,
        grossMargin: 40,
        expenses: 1500,
        expensesByCategory: [{ category: ExpenseCategory.RENT, total: 1500 }],
        itemsWithoutCost: 0,
      });
    });

    it('defaults to the current month up to today', async () => {
      sales.query.mockResolvedValue([]);
      expenses.query.mockResolvedValue([]);
      const kpis = await service.kpis({});
      expect(expenses.query.mock.calls[0][1]).toEqual(['2026-11-01', '2026-11-15']);
      expect(kpis.monthly.map((m) => m.month)).toEqual(['2026-11']);
    });
  });

  describe('summary', () => {
    it('merges membership revenue, sales and expenses for the last months', async () => {
      rpc.send.mockResolvedValue([{ month: '2026-10', total: 2400, count: 20 }]);
      sales.query.mockResolvedValue([{ month: '2026-11', total: '310.500' }]);
      expenses.query
        .mockResolvedValueOnce([{ month: '2026-11', total: '1500.000' }])
        .mockResolvedValueOnce([
          { category: ExpenseCategory.RENT, total: '1500.000' },
          { category: ExpenseCategory.OTHER, total: '0.000' },
        ]);

      const summary = await service.summary({ months: 3 });

      expect(rpc.send).toHaveBeenCalledWith(PATTERNS.membershipStats.revenue, { months: 3 }, 5_000);
      const [, salesParams] = sales.query.mock.calls[0];
      expect(salesParams.slice(0, 2)).toEqual([process.env.TZ || 'Africa/Tunis', SaleStatus.COMPLETED]);
      expect((salesParams[2] as Date).toISOString()).toBe('2026-08-31T23:00:00.000Z'); // 1 Sep, 00:00 in Tunis
      expect(expenses.query.mock.calls[0][1]).toEqual(['2026-09-01']);
      expect(summary.months).toEqual([
        { month: '2026-09', membershipRevenue: 0, salesRevenue: 0, expenses: 0, profit: 0 },
        { month: '2026-10', membershipRevenue: 2400, salesRevenue: 0, expenses: 0, profit: 2400 },
        { month: '2026-11', membershipRevenue: 0, salesRevenue: 310.5, expenses: 1500, profit: -1189.5 },
      ]);
      expect(summary.thisMonth).toEqual(summary.months[2]);
      expect(summary.expensesByCategory).toEqual([{ category: ExpenseCategory.RENT, total: 1500 }]);
    });

    it('still answers, with zero membership revenue, when membership-service is down', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      rpc.send.mockRejectedValue(new RpcError(503, 'Service indisponible (membershipStats.revenue)'));
      sales.query.mockResolvedValue([]);
      expenses.query.mockResolvedValue([]);

      const summary = await service.summary({});

      expect(summary.months).toHaveLength(12);
      expect(summary.months.every((month) => month.membershipRevenue === 0)).toBe(true);
      expect(summary.thisMonth.month).toBe('2026-11');
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('clamps the number of months to 1..36', async () => {
      rpc.send.mockResolvedValue([]);
      sales.query.mockResolvedValue([]);
      expenses.query.mockResolvedValue([]);
      expect((await service.summary({ months: 100 })).months).toHaveLength(36);
      expect((await service.summary({ months: 0 })).months).toHaveLength(1);
    });
  });

  describe('stats', () => {
    it('counts sales from local midnight and from the 1st of the month', async () => {
      const today = queryBuilder({ getRawOne: { total: '45.500' } });
      const month = queryBuilder({ getRawOne: { total: '1200.000' } });
      const spent = queryBuilder({ getRawOne: { total: '300.250' } });
      const low = queryBuilder({ getCount: 2 });
      sales.createQueryBuilder.mockReturnValueOnce(today).mockReturnValueOnce(month);
      expenses.createQueryBuilder.mockReturnValueOnce(spent);
      products.createQueryBuilder.mockReturnValueOnce(low);

      expect(await service.stats()).toEqual({
        salesToday: 45.5,
        salesThisMonth: 1200,
        expensesThisMonth: 300.25,
        lowStockProducts: 2,
      });
      expect(today.andWhere).toHaveBeenCalledWith('s.createdAt >= :from', { from: new Date(2026, 10, 15) });
      expect(month.andWhere).toHaveBeenCalledWith('s.createdAt >= :from', { from: new Date(2026, 10, 1) });
      expect(spent.where).toHaveBeenCalledWith('e.date >= :from', { from: '2026-11-01' });
    });
  });
});
