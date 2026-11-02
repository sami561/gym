import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import {
  CoachPtSummary,
  CoachPtSummaryRequest,
  EVENTS,
  EmployeeStatus,
  EventBus,
  GeneratePayrollRequest,
  LeaveStatus,
  LeaveType,
  ListPayrollRequest,
  PATTERNS,
  PayPayrollRequest,
  PaymentMethod,
  PayrollDto,
  PayrollStatus,
  RpcClient,
  UpdatePayrollRequest,
  fullName,
  parseDateOnly,
} from '@app/common';
import { Attendance } from '../attendance/attendance.entity';
import { Employee } from '../employees/employee.entity';
import { Leave } from '../leaves/leave.entity';
import { toPayrollDto } from '../mappers';
import { amount, oneOf, optionalText, period as parsePeriod } from '../shared/inputs';
import { Payroll } from './payroll.entity';
import {
  computePayroll,
  netAmount,
  overlapDays,
  periodBounds,
  periodEndExclusive,
  previousPeriod,
} from './payroll-rules';

const PT_TIMEOUT_MS = 4000;

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    @InjectRepository(Payroll) private readonly payrolls: Repository<Payroll>,
    @InjectRepository(Employee) private readonly employees: Repository<Employee>,
    @InjectRepository(Attendance) private readonly attendance: Repository<Attendance>,
    @InjectRepository(Leave) private readonly leaves: Repository<Leave>,
    private readonly rpc: RpcClient,
    private readonly events: EventBus,
  ) {}

  async list(request: ListPayrollRequest): Promise<PayrollDto[]> {
    const rows = await this.payrolls.find({
      where: {
        ...(request.period ? { period: parsePeriod(request.period) } : {}),
        ...(request.employeeId ? { employeeId: request.employeeId } : {}),
      },
      relations: { employee: true },
      order: { period: 'DESC', employee: { lastName: 'ASC', firstName: 'ASC' } },
      take: 1000,
    });
    return rows.map(toPayrollDto);
  }

  /**
   * Builds or refreshes the DRAFT payslips of a period (default: previous month).
   * PAID payslips are never touched. On drafts, computed parts are refreshed while
   * manual bonuses, deductions and notes are kept.
   */
  async generate(request: GeneratePayrollRequest): Promise<PayrollDto[]> {
    const period = request.period ? parsePeriod(request.period) : previousPeriod();
    const { start, end } = periodBounds(period);
    // Everyone employed during the period; deactivated people without an end date are excluded.
    const employees = await this.employees
      .createQueryBuilder('e')
      .where('"e"."hireDate" <= :end', { end })
      .andWhere('("e"."endDate" IS NULL OR "e"."endDate" >= :start)', { start })
      .andWhere('("e"."status" = :active OR "e"."endDate" IS NOT NULL)', { active: EmployeeStatus.ACTIVE })
      .getMany();

    if (employees.length) {
      const ids = employees.map((employee) => employee.id);
      const [minutes, unpaidDays, existing, pt] = await Promise.all([
        this.workedMinutes(ids, period),
        this.unpaidLeaveDays(ids, start, end),
        this.payrolls.find({ where: { period, employeeId: In(ids) } }),
        Promise.all(employees.map((employee) => this.ptSummary(employee, period))),
      ]);
      const existingByEmployee = new Map(existing.map((row) => [row.employeeId, row]));

      const rows: Payroll[] = [];
      employees.forEach((employee, index) => {
        const current = existingByEmployee.get(employee.id);
        if (current?.status === PayrollStatus.PAID) return;
        const computed = computePayroll({
          salaryType: employee.salaryType,
          baseSalary: employee.baseSalary,
          commissionRate: employee.commissionRate,
          unpaidLeaveDays: unpaidDays.get(employee.id) ?? 0,
          workedMinutes: minutes.get(employee.id) ?? 0,
          ptSessions: pt[index].sessions,
          ptRevenue: pt[index].revenue,
        });
        const row =
          current ??
          this.payrolls.create({
            employeeId: employee.id,
            period,
            bonuses: 0,
            deductions: 0,
            notes: null,
            status: PayrollStatus.DRAFT,
            paidAt: null,
            method: null,
          });
        Object.assign(row, computed);
        row.netAmount = netAmount(row);
        rows.push(row);
      });
      await this.payrolls.save(rows);
    }
    return this.list({ period });
  }

  async update(request: UpdatePayrollRequest): Promise<PayrollDto> {
    const row = await this.findOrFail(request.id);
    if (row.status === PayrollStatus.PAID) {
      throw new ConflictException('Fiche de paie déjà payée : modification impossible.');
    }
    const data = request.data ?? {};
    if (data.bonuses !== undefined) row.bonuses = amount(data.bonuses, 'Les primes');
    if (data.deductions !== undefined) row.deductions = amount(data.deductions, 'Les retenues');
    if (data.commissions !== undefined) row.commissions = amount(data.commissions, 'Les commissions');
    if (data.notes !== undefined) row.notes = optionalText(data.notes) ?? null;
    row.netAmount = netAmount(row);
    return toPayrollDto(await this.payrolls.save(row));
  }

  async pay(request: PayPayrollRequest): Promise<PayrollDto> {
    const method = oneOf(request.method, PaymentMethod, 'Mode de paiement');
    const row = await this.findOrFail(request.id);
    if (row.status === PayrollStatus.PAID) throw new ConflictException('Fiche de paie déjà payée.');
    if (row.netAmount < 0) throw new ConflictException('Montant net négatif : vérifiez les retenues.');

    // Conditional update so two simultaneous clicks cannot pay (and book the expense) twice.
    const paidAt = new Date();
    const result = await this.payrolls.update(
      { id: row.id, status: PayrollStatus.DRAFT },
      { status: PayrollStatus.PAID, paidAt, method },
    );
    if (!result.affected) throw new ConflictException('Fiche de paie déjà payée.');

    const paid = await this.findOrFail(row.id);
    this.events.publish(EVENTS.payrollPaid, {
      payrollId: paid.id,
      employeeId: paid.employeeId,
      employeeName: fullName(paid.employee),
      period: paid.period,
      netAmount: paid.netAmount,
      method,
      paidAt: paidAt.toISOString(),
    });
    return toPayrollDto(paid);
  }

  /** Drafts for the month that just ended, ready for review on the 1st at 06:00. */
  @Cron('0 6 1 * *')
  async generateMonthlyDrafts(): Promise<void> {
    const rows = await this.generate({});
    this.logger.log(`Fiches de paie ${previousPeriod()} préparées (${rows.length})`);
  }

  private async findOrFail(id: string): Promise<Payroll> {
    const row = id ? await this.payrolls.findOne({ where: { id }, relations: { employee: true } }) : null;
    if (!row) throw new NotFoundException('Fiche de paie introuvable.');
    return row;
  }

  /** Closed time-clock minutes per employee, by clock-in date within the period. */
  private async workedMinutes(ids: string[], period: string): Promise<Map<string, number>> {
    const from = parseDateOnly(periodBounds(period).start);
    const to = parseDateOnly(periodEndExclusive(period));
    const rows = await this.attendance
      .createQueryBuilder('a')
      .select('"a"."employeeId"', 'employeeId')
      .addSelect('COALESCE(SUM("a"."minutes"), 0)', 'minutes')
      .where('"a"."employeeId" IN (:...ids)', { ids })
      .andWhere('"a"."clockIn" >= :from AND "a"."clockIn" < :to', { from, to })
      .andWhere('"a"."clockOut" IS NOT NULL')
      .groupBy('"a"."employeeId"')
      .getRawMany<{ employeeId: string; minutes: string }>();
    return new Map(rows.map((row) => [row.employeeId, Number(row.minutes)]));
  }

  private async unpaidLeaveDays(ids: string[], start: string, end: string): Promise<Map<string, number>> {
    const leaves = await this.leaves.find({
      where: {
        employeeId: In(ids),
        type: LeaveType.UNPAID,
        status: LeaveStatus.APPROVED,
        startDate: LessThanOrEqual(end),
        endDate: MoreThanOrEqual(start),
      },
    });
    const days = new Map<string, number>();
    for (const leave of leaves) {
      const overlap = overlapDays(leave.startDate, leave.endDate, start, end);
      days.set(leave.employeeId, (days.get(leave.employeeId) ?? 0) + overlap);
    }
    return days;
  }

  /** Personal-training activity from training-service; 0 when unlinked or unavailable. */
  private async ptSummary(employee: Employee, period: string): Promise<{ sessions: number; revenue: number }> {
    if (!employee.userId) return { sessions: 0, revenue: 0 };
    try {
      const summary = await this.rpc.send<CoachPtSummary, CoachPtSummaryRequest>(
        PATTERNS.ptSessions.coachSummary,
        { coachId: employee.userId, period },
        PT_TIMEOUT_MS,
      );
      return { sessions: Number(summary?.sessions) || 0, revenue: Number(summary?.revenue) || 0 };
    } catch (err) {
      this.logger.warn(
        `Séances coaching indisponibles pour ${fullName(employee)} (${period}) : ${(err as Error).message}`,
      );
      return { sessions: 0, revenue: 0 };
    }
  }
}
