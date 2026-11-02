import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CommerceStats,
  ExpenseCategory,
  FinanceSummary,
  FinanceSummaryRequest,
  PATTERNS,
  RevenuePoint,
  RevenueRequest,
  RpcClient,
  SaleStatus,
  addMonths,
  startOfDay,
  startOfMonth,
  toDateOnly,
} from '@app/common';
import { Sale } from '../sales/sale.entity';
import { Expense } from '../expenses/expense.entity';
import { Product } from '../products/product.entity';
import { buildFinanceMonths, emptyFinanceMonth } from './finance.utils';
import { clampInt, gymTimezone, monthKeysBack } from '../shared/periods';

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    @InjectRepository(Expense) private readonly expenses: Repository<Expense>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly rpc: RpcClient,
  ) {}

  async summary(request: FinanceSummaryRequest): Promise<FinanceSummary> {
    const months = clampInt(request.months, 12, 1, 36);
    const keys = monthKeysBack(months);
    const windowStart = addMonths(startOfMonth(), -(months - 1));
    const windowStartDay = toDateOnly(windowStart);

    const [membership, salesRows, expenseRows, categoryRows] = await Promise.all([
      this.membershipRevenue(months),
      this.sales.query(
        `SELECT to_char("createdAt" AT TIME ZONE $1, 'YYYY-MM') AS month, COALESCE(SUM("total"), 0) AS total
           FROM "sales"
          WHERE "status" = $2 AND "createdAt" >= $3
          GROUP BY 1`,
        [gymTimezone(), SaleStatus.COMPLETED, windowStart],
      ) as Promise<{ month: string; total: string }[]>,
      this.expenses.query(
        `SELECT to_char("date", 'YYYY-MM') AS month, COALESCE(SUM("amount"), 0) AS total
           FROM "expenses"
          WHERE "date" >= $1
          GROUP BY 1`,
        [windowStartDay],
      ) as Promise<{ month: string; total: string }[]>,
      this.expenses.query(
        `SELECT "category", COALESCE(SUM("amount"), 0) AS total
           FROM "expenses"
          WHERE "date" >= $1
          GROUP BY 1
          ORDER BY 2 DESC`,
        [windowStartDay],
      ) as Promise<{ category: ExpenseCategory; total: string }[]>,
    ]);

    const monthsData = buildFinanceMonths(keys, membership, toRecord(salesRows), toRecord(expenseRows));
    return {
      months: monthsData,
      expensesByCategory: categoryRows
        .map((row) => ({ category: row.category, total: Number(row.total) }))
        .filter((row) => row.total > 0),
      thisMonth: monthsData[monthsData.length - 1] ?? emptyFinanceMonth(keys[keys.length - 1]),
    };
  }

  async stats(): Promise<CommerceStats> {
    const today = startOfDay();
    const monthStart = startOfMonth();
    const [salesToday, salesThisMonth, expenses, lowStock] = await Promise.all([
      this.sumSales(today),
      this.sumSales(monthStart),
      this.expenses
        .createQueryBuilder('e')
        .select('COALESCE(SUM(e.amount), 0)', 'total')
        .where('e.date >= :from', { from: toDateOnly(monthStart) })
        .getRawOne<{ total: string }>(),
      this.products
        .createQueryBuilder('p')
        .where('p.isActive = true')
        .andWhere('p.stock IS NOT NULL AND p.stock <= p.lowStockThreshold')
        .getCount(),
    ]);
    return {
      salesToday,
      salesThisMonth,
      expensesThisMonth: Number(expenses?.total ?? 0),
      lowStockProducts: lowStock,
    };
  }

  private async sumSales(from: Date): Promise<number> {
    const row = await this.sales
      .createQueryBuilder('s')
      .select('COALESCE(SUM(s.total), 0)', 'total')
      .where('s.status = :status', { status: SaleStatus.COMPLETED })
      .andWhere('s.createdAt >= :from', { from })
      .getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }

  /** Membership revenue per month; the summary still answers (with 0) if membership-service is down. */
  private async membershipRevenue(months: number): Promise<RevenuePoint[]> {
    try {
      return await this.rpc.send<RevenuePoint[], RevenueRequest>(PATTERNS.membershipStats.revenue, { months }, 5_000);
    } catch (err) {
      this.logger.warn(`Membership revenue unavailable: ${(err as Error).message}`);
      return [];
    }
  }
}

function toRecord(rows: { month: string; total: string }[]): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.month, Number(row.total)]));
}
