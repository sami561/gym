import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { EmployeeStatus, LeaveStatus, StaffStats, monthKey } from '@app/common';
import { Attendance } from '../attendance/attendance.entity';
import { Employee } from '../employees/employee.entity';
import { Leave } from '../leaves/leave.entity';
import { Payroll } from '../payroll/payroll.entity';

@Injectable()
export class StaffStatsService {
  constructor(
    @InjectRepository(Employee) private readonly employees: Repository<Employee>,
    @InjectRepository(Attendance) private readonly attendance: Repository<Attendance>,
    @InjectRepository(Leave) private readonly leaves: Repository<Leave>,
    @InjectRepository(Payroll) private readonly payrolls: Repository<Payroll>,
  ) {}

  async summary(): Promise<StaffStats> {
    const [activeEmployees, presentNow, pendingLeaves, payroll] = await Promise.all([
      this.employees.count({ where: { status: EmployeeStatus.ACTIVE } }),
      this.attendance.count({ where: { clockOut: IsNull() } }),
      this.leaves.count({ where: { status: LeaveStatus.PENDING } }),
      this.payrolls
        .createQueryBuilder('p')
        .select('COALESCE(SUM("p"."netAmount"), 0)', 'total')
        .where('"p"."period" = :period', { period: monthKey(new Date()) })
        .getRawOne<{ total: string }>(),
    ]);
    return { activeEmployees, presentNow, pendingLeaves, payrollThisMonth: Number(payroll?.total ?? 0) };
  }
}
