import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusModule, databaseModule } from '@app/common';
import { AppController } from './app.controller';
import { Attendance } from './attendance/attendance.entity';
import { AttendanceController } from './attendance/attendance.controller';
import { AttendanceService } from './attendance/attendance.service';
import { Employee } from './employees/employee.entity';
import { EmployeesController } from './employees/employees.controller';
import { EmployeesService } from './employees/employees.service';
import { Leave } from './leaves/leave.entity';
import { LeavesController } from './leaves/leaves.controller';
import { LeavesService } from './leaves/leaves.service';
import { Payroll } from './payroll/payroll.entity';
import { PayrollController } from './payroll/payroll.controller';
import { PayrollService } from './payroll/payroll.service';
import { Shift } from './shifts/shift.entity';
import { ShiftsController } from './shifts/shifts.controller';
import { ShiftsService } from './shifts/shifts.service';
import { StaffStatsService } from './stats/staff-stats.service';

@Module({
  imports: [
    databaseModule('staff'),
    TypeOrmModule.forFeature([Employee, Shift, Attendance, Leave, Payroll]),
    BusModule.forRoot(),
    ScheduleModule.forRoot(),
  ],
  controllers: [
    AppController,
    EmployeesController,
    ShiftsController,
    AttendanceController,
    LeavesController,
    PayrollController,
  ],
  providers: [EmployeesService, ShiftsService, AttendanceService, LeavesService, PayrollService, StaffStatsService],
})
export class AppModule {}
