import { Controller, Logger } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateExpenseRequest,
  EVENTS,
  ExpenseDto,
  IdRequest,
  ListExpensesRequest,
  MaintenanceEvent,
  OkResult,
  PATTERNS,
  PayrollPaidEvent,
  UpdateExpenseRequest,
} from '@app/common';
import { ExpensesService } from './expenses.service';

@Controller()
export class ExpensesController {
  private readonly logger = new Logger(ExpensesController.name);

  constructor(private readonly expenses: ExpensesService) {}

  @MessagePattern(PATTERNS.expenses.list)
  list(@Payload() request: ListExpensesRequest): Promise<ExpenseDto[]> {
    return this.expenses.list(request ?? {});
  }

  @MessagePattern(PATTERNS.expenses.create)
  create(@Payload() request: CreateExpenseRequest): Promise<ExpenseDto> {
    return this.expenses.create(request);
  }

  @MessagePattern(PATTERNS.expenses.update)
  update(@Payload() request: UpdateExpenseRequest): Promise<ExpenseDto> {
    return this.expenses.update({ id: request.id, data: request.data ?? {} });
  }

  @MessagePattern(PATTERNS.expenses.remove)
  remove(@Payload() request: IdRequest): Promise<OkResult> {
    return this.expenses.remove(request);
  }

  @EventPattern(EVENTS.payrollPaid)
  async onPayrollPaid(@Payload() event: PayrollPaidEvent): Promise<void> {
    try {
      await this.expenses.recordPayroll(event);
    } catch (err) {
      this.logger.error(`payroll.paid ${event?.payrollId}: ${(err as Error).message}`);
    }
  }

  @EventPattern(EVENTS.maintenanceResolved)
  async onMaintenanceResolved(@Payload() event: MaintenanceEvent): Promise<void> {
    try {
      await this.expenses.recordMaintenance(event);
    } catch (err) {
      this.logger.error(`maintenance.resolved ${event?.ticketId}: ${(err as Error).message}`);
    }
  }
}
