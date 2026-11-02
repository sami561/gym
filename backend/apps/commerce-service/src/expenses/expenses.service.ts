import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import {
  CreateExpenseRequest,
  ExpenseCategory,
  ExpenseDto,
  IdRequest,
  ListExpensesRequest,
  MaintenanceEvent,
  OkResult,
  PaymentMethod,
  PayrollPaidEvent,
  UpdateExpenseRequest,
  toDateOnly,
} from '@app/common';
import { Expense, ExpenseSource } from './expense.entity';
import { toExpenseDto } from '../mappers';
import { round3 } from '../shared/money';
import { assertDateOnly, toDateBound } from '../shared/periods';

type AutomaticExpense = Pick<Expense, 'category' | 'label' | 'amount' | 'date' | 'paymentMethod' | 'reference'>;

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(@InjectRepository(Expense) private readonly expenses: Repository<Expense>) {}

  async list(request: ListExpensesRequest): Promise<ExpenseDto[]> {
    const query = this.expenses.createQueryBuilder('e');
    const from = toDateBound(request.from);
    const to = toDateBound(request.to);
    if (from) query.andWhere('e.date >= :from', { from });
    if (to) query.andWhere('e.date <= :to', { to });
    if (request.category) query.andWhere('e.category = :category', { category: request.category });
    const rows = await query.orderBy('e.date', 'DESC').addOrderBy('e.createdAt', 'DESC').getMany();
    return rows.map(toExpenseDto);
  }

  async create(request: CreateExpenseRequest): Promise<ExpenseDto> {
    const expense = this.expenses.create({
      category: requireCategory(request.category),
      label: requireLabel(request.label),
      amount: requireAmount(request.amount),
      date: assertDateOnly(request.date, 'La date'),
      paymentMethod: optionalMethod(request.paymentMethod),
      supplier: request.supplier?.trim() || null,
      reference: request.reference?.trim() || null,
      source: 'manual',
      sourceId: null,
      createdById: request.actor?.id ?? null,
      createdByName: request.actor?.name ?? null,
    });
    return toExpenseDto(await this.expenses.save(expense));
  }

  async update({ id, data }: UpdateExpenseRequest): Promise<ExpenseDto> {
    const expense = await this.expenses.findOne({ where: { id } });
    if (!expense) throw new NotFoundException('Dépense introuvable.');
    if (data.category !== undefined) expense.category = requireCategory(data.category);
    if (data.label !== undefined) expense.label = requireLabel(data.label);
    if (data.amount !== undefined) expense.amount = requireAmount(data.amount);
    if (data.date !== undefined) expense.date = assertDateOnly(data.date, 'La date');
    if (data.paymentMethod !== undefined) expense.paymentMethod = optionalMethod(data.paymentMethod);
    if (data.supplier !== undefined) expense.supplier = data.supplier?.trim() || null;
    if (data.reference !== undefined) expense.reference = data.reference?.trim() || null;
    return toExpenseDto(await this.expenses.save(expense));
  }

  async remove({ id }: IdRequest): Promise<OkResult> {
    const result = await this.expenses.delete({ id });
    if (!result.affected) throw new NotFoundException('Dépense introuvable.');
    return { ok: true };
  }

  /** payroll.paid → SALARY expense. */
  recordPayroll(event: PayrollPaidEvent): Promise<void> {
    return this.upsertAutomatic('payroll', `payroll:${event.payrollId}`, {
      category: ExpenseCategory.SALARY,
      label: `Salaire ${event.employeeName} — ${event.period}`,
      amount: round3(event.netAmount),
      date: toDateOnly(new Date(event.paidAt)),
      paymentMethod: event.method ?? null,
      reference: event.period,
    });
  }

  /** maintenance.resolved with a cost → MAINTENANCE expense. */
  async recordMaintenance(event: MaintenanceEvent): Promise<void> {
    if (!event.cost || event.cost <= 0) return;
    const subject = [event.equipmentName, event.roomName].filter(Boolean).join(' — ');
    await this.upsertAutomatic('maintenance', `maintenance:${event.ticketId}`, {
      category: ExpenseCategory.MAINTENANCE,
      label: `Maintenance : ${event.title}${subject ? ` (${subject})` : ''}`,
      amount: round3(event.cost),
      date: toDateOnly(new Date(event.at)),
      paymentMethod: null,
      reference: null,
    });
  }

  /** Idempotent on sourceId: replaying the same event updates the existing row. */
  private async upsertAutomatic(source: ExpenseSource, sourceId: string, fields: AutomaticExpense): Promise<void> {
    const existing = await this.expenses.findOne({ where: { sourceId } });
    if (existing) {
      await this.expenses.update({ id: existing.id }, fields);
      return;
    }
    try {
      await this.expenses.insert({ ...fields, source, sourceId, createdByName: 'Automatique' });
    } catch (err) {
      // Same event delivered twice at the same time: the other insert won.
      if (err instanceof QueryFailedError && (err as QueryFailedError & { code?: string }).code === '23505') {
        await this.expenses.update({ sourceId }, fields);
        return;
      }
      throw err;
    }
    this.logger.log(`Recorded ${source} expense ${sourceId} (${fields.amount} TND)`);
  }
}

function requireCategory(value: ExpenseCategory): ExpenseCategory {
  if (!Object.values(ExpenseCategory).includes(value)) throw new BadRequestException('Catégorie de dépense invalide.');
  return value;
}

function requireLabel(value: string | undefined): string {
  const label = value?.trim();
  if (!label) throw new BadRequestException('Le libellé de la dépense est obligatoire.');
  return label;
}

function requireAmount(value: number | undefined): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Le montant doit être supérieur à 0.');
  return round3(amount);
}

function optionalMethod(value: PaymentMethod | null | undefined): PaymentMethod | null {
  if (value === null || value === undefined) return null;
  if (!Object.values(PaymentMethod).includes(value)) throw new BadRequestException('Moyen de paiement invalide.');
  return value;
}
