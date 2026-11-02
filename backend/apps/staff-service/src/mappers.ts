import { AttendanceDto, EmployeeDto, LeaveDto, PayrollDto, ShiftDto, fullName } from '@app/common';
import { Attendance } from './attendance/attendance.entity';
import { Employee } from './employees/employee.entity';
import { Leave } from './leaves/leave.entity';
import { Payroll } from './payroll/payroll.entity';
import { Shift } from './shifts/shift.entity';

const nameOf = (employee?: Employee | null) => (employee ? fullName(employee) : '');

export function toEmployeeDto(e: Employee): EmployeeDto {
  return {
    id: e.id,
    userId: e.userId,
    firstName: e.firstName,
    lastName: e.lastName,
    email: e.email,
    phone: e.phone,
    position: e.position,
    contractType: e.contractType,
    hireDate: e.hireDate,
    endDate: e.endDate,
    salaryType: e.salaryType,
    baseSalary: e.baseSalary,
    commissionRate: e.commissionRate,
    cin: e.cin,
    cnssNumber: e.cnssNumber,
    rib: e.rib,
    status: e.status,
    notes: e.notes,
    createdAt: e.createdAt.toISOString(),
  };
}

export function toShiftDto(s: Shift): ShiftDto {
  return {
    id: s.id,
    employeeId: s.employeeId,
    employeeName: nameOf(s.employee),
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    task: s.task,
    roomName: s.roomName,
  };
}

export function toAttendanceDto(a: Attendance): AttendanceDto {
  return {
    id: a.id,
    employeeId: a.employeeId,
    employeeName: nameOf(a.employee),
    clockIn: a.clockIn.toISOString(),
    clockOut: a.clockOut ? a.clockOut.toISOString() : null,
    minutes: a.minutes,
    lateMinutes: a.lateMinutes,
    source: a.source,
  };
}

export function toLeaveDto(l: Leave): LeaveDto {
  return {
    id: l.id,
    employeeId: l.employeeId,
    employeeName: nameOf(l.employee),
    type: l.type,
    from: l.startDate,
    to: l.endDate,
    days: l.days,
    status: l.status,
    reason: l.reason,
    decidedByName: l.decidedByName,
    createdAt: l.createdAt.toISOString(),
  };
}

export function toPayrollDto(p: Payroll): PayrollDto {
  return {
    id: p.id,
    employeeId: p.employeeId,
    employeeName: nameOf(p.employee),
    period: p.period,
    baseAmount: p.baseAmount,
    hoursWorked: p.hoursWorked,
    sessions: p.sessions,
    commissions: p.commissions,
    bonuses: p.bonuses,
    deductions: p.deductions,
    netAmount: p.netAmount,
    status: p.status,
    paidAt: p.paidAt ? p.paidAt.toISOString() : null,
    method: p.method,
    notes: p.notes,
  };
}
