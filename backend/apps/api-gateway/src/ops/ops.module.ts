import { Module } from '@nestjs/common';
import { EmployeesController } from './staff/employees.controller';
import { ShiftsController } from './staff/shifts.controller';
import { AttendanceController } from './staff/attendance.controller';
import { LeavesController } from './staff/leaves.controller';
import { PayrollController } from './staff/payroll.controller';
import { RoomsController } from './facility/rooms.controller';
import { EquipmentController } from './facility/equipment.controller';
import { MaintenanceController } from './facility/maintenance.controller';
import { LockersController } from './facility/lockers.controller';
import { ProductsController } from './commerce/products.controller';
import { StockController } from './commerce/stock.controller';
import { SalesController } from './commerce/sales.controller';
import { ExpensesController } from './commerce/expenses.controller';
import { FinanceController } from './commerce/finance.controller';
import { ExercisesController } from './training/exercises.controller';
import { ProgramsController } from './training/programs.controller';
import { MeasurementsController } from './training/measurements.controller';
import { PtSessionsController } from './training/pt-sessions.controller';
import { WorkflowsController } from './workflows/workflows.controller';
import { WorkflowRunsController } from './workflows/workflow-runs.controller';
import { TasksController } from './workflows/tasks.controller';

/**
 * Gateway routes of the operations modules (staff, facility, commerce, training,
 * workflows). Every controller of src/ops/** is registered here.
 */
@Module({
  controllers: [
    EmployeesController,
    ShiftsController,
    AttendanceController,
    LeavesController,
    PayrollController,
    RoomsController,
    EquipmentController,
    MaintenanceController,
    LockersController,
    ProductsController,
    StockController,
    SalesController,
    ExpensesController,
    FinanceController,
    ExercisesController,
    ProgramsController,
    MeasurementsController,
    PtSessionsController,
    WorkflowsController,
    WorkflowRunsController,
    TasksController,
  ],
})
export class OpsModule {}
