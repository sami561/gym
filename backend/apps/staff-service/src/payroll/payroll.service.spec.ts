import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  ContractType,
  EVENTS,
  EmployeePosition,
  EmployeeStatus,
  EventBus,
  LeaveStatus,
  LeaveType,
  PATTERNS,
  PaymentMethod,
  PayrollStatus,
  Role,
  RpcClient,
  RpcError,
  SalaryType,
} from '@app/common';
import { Attendance } from '../attendance/attendance.entity';
import { Employee } from '../employees/employee.entity';
import { Leave } from '../leaves/leave.entity';
import { Payroll } from './payroll.entity';
import { PayrollService } from './payroll.service';

const actor = { id: 'u-admin', role: Role.ADMIN, name: 'Admin' };

function employee(id: string, overrides: Partial<Employee>): Employee {
  return Object.assign(new Employee(), {
    id,
    userId: null,
    firstName: id.toUpperCase(),
    lastName: 'Test',
    position: EmployeePosition.RECEPTION,
    contractType: ContractType.CDI,
    hireDate: '2025-01-01',
    endDate: null,
    salaryType: SalaryType.MONTHLY,
    baseSalary: 1300,
    commissionRate: 0,
    status: EmployeeStatus.ACTIVE,
    ...overrides,
  });
}

function payslip(overrides: Partial<Payroll>): Payroll {
  return Object.assign(new Payroll(), {
    id: 'pr-1',
    employeeId: 'e-1',
    employee: employee('e-1', {}),
    period: '2026-10',
    baseAmount: 1100,
    hoursWorked: 0,
    sessions: 0,
    commissions: 0,
    bonuses: 0,
    deductions: 0,
    netAmount: 1100,
    status: PayrollStatus.DRAFT,
    paidAt: null,
    method: null,
    notes: null,
    ...overrides,
  });
}

function chain(terminal: Record<string, unknown>) {
  const qb: Record<string, jest.Mock> = {};
  for (const method of ['select', 'addSelect', 'where', 'andWhere', 'groupBy']) qb[method] = jest.fn(() => qb);
  for (const [method, value] of Object.entries(terminal)) qb[method] = jest.fn().mockResolvedValue(value);
  return qb;
}

function setup({ staff = [] as Employee[], minutes = [] as { employeeId: string; minutes: string }[], leaves = [] as Leave[], existing = [] as Payroll[] } = {}) {
  const employeesQuery = chain({ getMany: staff });
  const minutesQuery = chain({ getRawMany: minutes });
  const payrolls = {
    find: jest.fn().mockResolvedValueOnce(existing).mockResolvedValue([]),
    findOne: jest.fn(),
    create: jest.fn((data: Partial<Payroll>) => Object.assign(new Payroll(), data)),
    save: jest.fn(async (rows: Payroll | Payroll[]) => rows),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const rpc = { send: jest.fn().mockResolvedValue({ sessions: 0, revenue: 0 }) };
  const events = { publish: jest.fn() };
  const service = new PayrollService(
    payrolls as unknown as Repository<Payroll>,
    { createQueryBuilder: jest.fn(() => employeesQuery) } as unknown as Repository<Employee>,
    { createQueryBuilder: jest.fn(() => minutesQuery) } as unknown as Repository<Attendance>,
    { find: jest.fn().mockResolvedValue(leaves) } as unknown as Repository<Leave>,
    rpc as unknown as RpcClient,
    events as unknown as EventBus,
  );
  const savedRows = (): Payroll[] => (payrolls.save.mock.calls[0]?.[0] as Payroll[]) ?? [];
  return { service, payrolls, rpc, events, employeesQuery, minutesQuery, savedRows };
}

describe('PayrollService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2026, 10, 2, 6, 0) }); // 2 Nov 2026 in Tunis
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('generate (drafts of a month)', () => {
    it('defaults to the previous month and selects the people employed during it', async () => {
      const { service, employeesQuery, payrolls } = setup();
      await service.generate({});
      expect(employeesQuery.where).toHaveBeenCalledWith('"e"."hireDate" <= :end', { end: '2026-10-31' });
      expect(employeesQuery.andWhere).toHaveBeenCalledWith('("e"."endDate" IS NULL OR "e"."endDate" >= :start)', { start: '2026-10-01' });
      expect(payrolls.save).not.toHaveBeenCalled();
    });

    it('refuses a malformed period', async () => {
      await expect(setup().service.generate({ period: '2026-13' })).rejects.toThrow('Période invalide (AAAA-MM attendu).');
    });

    it('computes monthly, hourly and per-session pay with unpaid leave clipped to the month', async () => {
      const monthly = employee('e-month', { salaryType: SalaryType.MONTHLY, baseSalary: 1300 });
      const hourly = employee('e-hour', { salaryType: SalaryType.HOURLY, baseSalary: 7.5 });
      const coach = employee('e-coach', { userId: 'u-coach', salaryType: SalaryType.PER_SESSION, baseSalary: 25, commissionRate: 0.1 });
      const leave = (startDate: string, endDate: string) =>
        Object.assign(new Leave(), { employeeId: 'e-month', type: LeaveType.UNPAID, status: LeaveStatus.APPROVED, startDate, endDate });
      const { service, rpc, minutesQuery, savedRows } = setup({
        staff: [monthly, hourly, coach],
        minutes: [{ employeeId: 'e-hour', minutes: '9620' }],
        leaves: [leave('2026-09-28', '2026-10-02'), leave('2026-10-30', '2026-11-03')],
      });
      rpc.send.mockResolvedValue({ coachId: 'u-coach', period: '2026-10', sessions: 12, revenue: 1440 });

      await service.generate({ period: '2026-10' });

      // Time-clock minutes are counted by clock-in day, over whole gym days of the month.
      expect(minutesQuery.andWhere).toHaveBeenCalledWith('"a"."clockIn" >= :from AND "a"."clockIn" < :to', {
        from: new Date(2026, 9, 1),
        to: new Date(2026, 10, 1),
      });
      expect(rpc.send).toHaveBeenCalledTimes(1);
      expect(rpc.send).toHaveBeenCalledWith(PATTERNS.ptSessions.coachSummary, { coachId: 'u-coach', period: '2026-10' }, 4000);
      const byEmployee = Object.fromEntries(savedRows().map((row) => [row.employeeId, row]));
      expect(byEmployee['e-month']).toMatchObject({ period: '2026-10', baseAmount: 1100, netAmount: 1100, status: PayrollStatus.DRAFT }); // 4 unpaid days × 1300/26
      expect(byEmployee['e-hour']).toMatchObject({ hoursWorked: 160.33, baseAmount: 1202.5, netAmount: 1202.5 });
      expect(byEmployee['e-coach']).toMatchObject({ sessions: 12, baseAmount: 300, commissions: 144, netAmount: 444 });
    });

    it('never touches a paid payslip and keeps the manual parts of a draft', async () => {
      const paid = payslip({ id: 'pr-paid', employeeId: 'e-paid', status: PayrollStatus.PAID, netAmount: 999 });
      const draft = payslip({ id: 'pr-draft', employeeId: 'e-draft', bonuses: 100, deductions: 30, notes: 'Prime Ramadan', baseAmount: 1, netAmount: 71 });
      const { service, savedRows } = setup({
        staff: [employee('e-paid', {}), employee('e-draft', {})],
        existing: [paid, draft],
      });
      await service.generate({ period: '2026-10' });
      expect(savedRows().map((row) => row.id)).toEqual(['pr-draft']);
      expect(savedRows()[0]).toMatchObject({ baseAmount: 1300, bonuses: 100, deductions: 30, notes: 'Prime Ramadan', netAmount: 1370 });
      expect(paid.netAmount).toBe(999);
    });

    it('pays no session when training-service does not answer', async () => {
      const coach = employee('e-coach', { userId: 'u-coach', salaryType: SalaryType.PER_SESSION, baseSalary: 25, commissionRate: 0.1 });
      const { service, rpc, savedRows } = setup({ staff: [coach] });
      rpc.send.mockRejectedValue(new RpcError(503, 'Service indisponible (ptSessions.coachSummary)'));
      await service.generate({ period: '2026-10' });
      expect(savedRows()[0]).toMatchObject({ sessions: 0, baseAmount: 0, commissions: 0, netAmount: 0 });
      expect(Logger.prototype.warn).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('refuses to change a paid payslip', async () => {
      const { service, payrolls } = setup();
      payrolls.findOne.mockResolvedValue(payslip({ status: PayrollStatus.PAID }));
      await expect(service.update({ id: 'pr-1', data: { bonuses: 50 } })).rejects.toThrow(
        new ConflictException('Fiche de paie déjà payée : modification impossible.'),
      );
    });

    it('validates amounts and recomputes the net', async () => {
      const { service, payrolls } = setup();
      payrolls.findOne.mockResolvedValue(payslip({ baseAmount: 1100, commissions: 20 }));
      await expect(service.update({ id: 'pr-1', data: { bonuses: -5 } })).rejects.toThrow('Les primes doit être un nombre positif ou nul.');
      const dto = await service.update({ id: 'pr-1', data: { bonuses: 50, deductions: 25.5, notes: '  ' } });
      expect(dto).toMatchObject({ bonuses: 50, deductions: 25.5, notes: null, netAmount: 1144.5 });
    });

    it('answers 404 for an unknown payslip', async () => {
      const { service, payrolls } = setup();
      payrolls.findOne.mockResolvedValue(null);
      await expect(service.update({ id: 'pr-x', data: {} })).rejects.toThrow(new NotFoundException('Fiche de paie introuvable.'));
    });
  });

  describe('pay', () => {
    it('refuses an unknown method, a paid payslip and a negative net', async () => {
      const { service, payrolls } = setup();
      await expect(service.pay({ id: 'pr-1', method: 'CHEQUE' as PaymentMethod, actor })).rejects.toThrow('Mode de paiement invalide.');
      payrolls.findOne.mockResolvedValueOnce(payslip({ status: PayrollStatus.PAID }));
      await expect(service.pay({ id: 'pr-1', method: PaymentMethod.CASH, actor })).rejects.toThrow(
        new ConflictException('Fiche de paie déjà payée.'),
      );
      payrolls.findOne.mockResolvedValueOnce(payslip({ netAmount: -20 }));
      await expect(service.pay({ id: 'pr-1', method: PaymentMethod.CASH, actor })).rejects.toThrow(
        'Montant net négatif : vérifiez les retenues.',
      );
    });

    it('pays only once when two clicks race', async () => {
      const { service, payrolls, events } = setup();
      payrolls.findOne.mockResolvedValue(payslip({}));
      payrolls.update.mockResolvedValue({ affected: 0 });
      await expect(service.pay({ id: 'pr-1', method: PaymentMethod.CASH, actor })).rejects.toThrow('Fiche de paie déjà payée.');
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('marks the draft paid and announces it (booked as an expense by commerce)', async () => {
      const { service, payrolls, events } = setup();
      const paidAt = new Date();
      payrolls.findOne
        .mockResolvedValueOnce(payslip({}))
        .mockResolvedValueOnce(payslip({ status: PayrollStatus.PAID, paidAt, method: PaymentMethod.TRANSFER }));

      const dto = await service.pay({ id: 'pr-1', method: PaymentMethod.TRANSFER, actor });

      expect(payrolls.update).toHaveBeenCalledWith(
        { id: 'pr-1', status: PayrollStatus.DRAFT },
        { status: PayrollStatus.PAID, paidAt, method: PaymentMethod.TRANSFER },
      );
      expect(events.publish).toHaveBeenCalledWith(EVENTS.payrollPaid, {
        payrollId: 'pr-1',
        employeeId: 'e-1',
        employeeName: 'E-1 Test',
        period: '2026-10',
        netAmount: 1100,
        method: PaymentMethod.TRANSFER,
        paidAt: paidAt.toISOString(),
      });
      expect(dto.status).toBe(PayrollStatus.PAID);
    });
  });
});
