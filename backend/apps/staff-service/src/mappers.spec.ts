import {
  ContractType,
  EmployeePosition,
  EmployeeStatus,
  LeaveStatus,
  LeaveType,
  PaymentMethod,
  PayrollStatus,
  SalaryType,
} from '@app/common';
import { Attendance } from './attendance/attendance.entity';
import { Employee } from './employees/employee.entity';
import { Leave } from './leaves/leave.entity';
import { Payroll } from './payroll/payroll.entity';
import { Shift } from './shifts/shift.entity';
import { toAttendanceDto, toEmployeeDto, toLeaveDto, toPayrollDto, toShiftDto } from './mappers';

const at = new Date('2026-11-02T07:00:00.000Z');

const employee = (): Employee =>
  Object.assign(new Employee(), {
    id: 'e-1',
    userId: 'u-coach',
    firstName: 'Karim',
    lastName: 'Jaziri',
    email: 'karim@example.com',
    phone: null,
    position: EmployeePosition.COACH,
    contractType: ContractType.CDI,
    hireDate: '2025-09-01',
    endDate: null,
    salaryType: SalaryType.PER_SESSION,
    baseSalary: 25,
    commissionRate: 0.1,
    cin: '00000000',
    cnssNumber: null,
    rib: null,
    status: EmployeeStatus.ACTIVE,
    notes: null,
    createdAt: at,
    updatedAt: at,
  });

describe('staff mappers', () => {
  it('maps an employee without its update timestamp', () => {
    const dto = toEmployeeDto(employee());
    expect(dto).toMatchObject({ id: 'e-1', userId: 'u-coach', salaryType: SalaryType.PER_SESSION, createdAt: '2026-11-02T07:00:00.000Z' });
    expect(dto).not.toHaveProperty('updatedAt');
  });

  it('names the employee of a shift, empty when the relation is missing', () => {
    const shift = Object.assign(new Shift(), {
      id: 'sh-1',
      employeeId: 'e-1',
      startsAt: at,
      endsAt: new Date('2026-11-02T15:00:00.000Z'),
      task: 'Accueil',
      roomName: null,
      createdAt: at,
    });
    expect(toShiftDto(Object.assign(shift, { employee: employee() }))).toEqual({
      id: 'sh-1',
      employeeId: 'e-1',
      employeeName: 'Karim Jaziri',
      startsAt: '2026-11-02T07:00:00.000Z',
      endsAt: '2026-11-02T15:00:00.000Z',
      task: 'Accueil',
      roomName: null,
    });
    expect(toShiftDto(Object.assign(new Shift(), shift, { employee: undefined })).employeeName).toBe('');
  });

  it('keeps an open time-clock entry open', () => {
    const entry = Object.assign(new Attendance(), {
      id: 'a-1',
      employeeId: 'e-1',
      clockIn: at,
      clockOut: null,
      minutes: null,
      lateMinutes: 12,
      source: 'KIOSK' as const,
      createdAt: at,
    });
    expect(toAttendanceDto(entry)).toEqual({
      id: 'a-1',
      employeeId: 'e-1',
      employeeName: '',
      clockIn: '2026-11-02T07:00:00.000Z',
      clockOut: null,
      minutes: null,
      lateMinutes: 12,
      source: 'KIOSK',
    });
  });

  it('exposes leave dates as from / to', () => {
    const leave = Object.assign(new Leave(), {
      id: 'l-1',
      employeeId: 'e-1',
      employee: employee(),
      type: LeaveType.ANNUAL,
      startDate: '2026-12-21',
      endDate: '2026-12-25',
      days: 5,
      status: LeaveStatus.APPROVED,
      reason: null,
      decidedByName: 'Admin',
      decidedAt: at,
      createdAt: at,
    });
    expect(toLeaveDto(leave)).toMatchObject({ from: '2026-12-21', to: '2026-12-25', days: 5, employeeName: 'Karim Jaziri' });
  });

  it('maps a payslip, paid or not', () => {
    const payroll = Object.assign(new Payroll(), {
      id: 'pr-1',
      employeeId: 'e-1',
      employee: employee(),
      period: '2026-10',
      baseAmount: 300,
      hoursWorked: 0,
      sessions: 12,
      commissions: 144,
      bonuses: 0,
      deductions: 0,
      netAmount: 444,
      status: PayrollStatus.DRAFT,
      paidAt: null,
      method: null,
      notes: null,
      createdAt: at,
      updatedAt: at,
    });
    expect(toPayrollDto(payroll)).toMatchObject({ employeeName: 'Karim Jaziri', netAmount: 444, paidAt: null, method: null });
    expect(toPayrollDto(Object.assign(payroll, { status: PayrollStatus.PAID, paidAt: at, method: PaymentMethod.TRANSFER }))).toMatchObject({
      status: PayrollStatus.PAID,
      paidAt: '2026-11-02T07:00:00.000Z',
      method: PaymentMethod.TRANSFER,
    });
  });
});
