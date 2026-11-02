import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CommerceKpisRequest,
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
import { CommerceKpisResult, KpiSale, computeCommerceKpis } from './kpis';
import {
  assertDateOnly,
  clampInt,
  gymTimezone,
  monthKeysBack,
  monthKeysBetween,
  parseFrom,
  parseToExclusive,
} from '../shared/periods';

const MAX_KPI_MONTHS = 60;

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
      this.sales.query<{ month: string; total: string }[]>(
        `SELECT to_char("createdAt" AT TIME ZONE $1, 'YYYY-MM') AS month, COALESCE(SUM("total"), 0) AS total
           FROM "sales"
          WHERE "status" = $2 AND "createdAt" >= $3
          GROUP BY 1`,
        [gymTimezone(), SaleStatus.COMPLETED, windowStart],
      ),
      this.expenses.query<{ month: string; total: string }[]>(
        `SELECT to_char("date", 'YYYY-MM') AS month, COALESCE(SUM("amount"), 0) AS total
           FROM "expenses"
          WHERE "date" >= $1
          GROUP BY 1`,
        [windowStartDay],
      ),
      this.expenses.query<{ category: ExpenseCategory; total: string }[]>(
        `SELECT "category", COALESCE(SUM("amount"), 0) AS total
           FROM "expenses"
          WHERE "date" >= $1
          GROUP BY 1
          ORDER BY 2 DESC`,
        [windowStartDay],
      ),
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

  /**
   * Shop side of GMV / NMV / margin for a date range (YYYY-MM-DD, both inclusive, gym timezone).
   * Defaults to the current month up to today.
   */
  async kpis(request: CommerceKpisRequest): Promise<CommerceKpisResult> {
    const from = request.from ? assertDateOnly(request.from.slice(0, 10), 'La date de début') : toDateOnly(startOfMonth());
    const to = request.to ? assertDateOnly(request.to.slice(0, 10), 'La date de fin') : toDateOnly();
    if (from > to) throw new BadRequestException('La date de début doit précéder la date de fin.');
    const months = monthKeysBetween(from, to);
    if (months.length > MAX_KPI_MONTHS) {
      throw new BadRequestException(`Période trop longue (${MAX_KPI_MONTHS} mois maximum).`);
    }

    const [saleRows, expenseRows] = await Promise.all([
      this.sales.query<
        { month: string; status: KpiSale['status']; subtotal: string; discount: string; total: string; items: KpiSale['items'] }[]
      >(
        `SELECT to_char("createdAt" AT TIME ZONE $1, 'YYYY-MM') AS month,
                "status", "subtotal", "discount", "total", "items"
           FROM "sales"
          WHERE "createdAt" >= $2 AND "createdAt" < $3`,
        [gymTimezone(), parseFrom(from), parseToExclusive(to)],
      ),
      this.expenses.query<{ month: string; category: ExpenseCategory; amount: string }[]>(
        `SELECT to_char("date", 'YYYY-MM') AS month, "category", SUM("amount") AS amount
           FROM "expenses"
          WHERE "date" >= $1 AND "date" <= $2
          GROUP BY 1, 2`,
        [from, to],
      ),
    ]);

    return computeCommerceKpis(
      months,
      saleRows.map((row) => ({
        month: row.month,
        status: row.status,
        subtotal: Number(row.subtotal),
        discount: Number(row.discount),
        total: Number(row.total),
        items: row.items ?? [],
      })),
      expenseRows.map((row) => ({ month: row.month, category: row.category, amount: Number(row.amount) })),
    );
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
