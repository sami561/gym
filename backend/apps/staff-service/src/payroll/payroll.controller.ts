import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  GeneratePayrollRequest,
  ListPayrollRequest,
  PATTERNS,
  PayPayrollRequest,
  PayrollDto,
  UpdatePayrollRequest,
} from '@app/common';
import { PayrollService } from './payroll.service';

@Controller()
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @MessagePattern(PATTERNS.payroll.list)
  list(@Payload() request: ListPayrollRequest): Promise<PayrollDto[]> {
    return this.payroll.list(request ?? {});
  }

  @MessagePattern(PATTERNS.payroll.generate)
  generate(@Payload() request: GeneratePayrollRequest): Promise<PayrollDto[]> {
    return this.payroll.generate(request ?? {});
  }

  @MessagePattern(PATTERNS.payroll.update)
  update(@Payload() request: UpdatePayrollRequest): Promise<PayrollDto> {
    return this.payroll.update(request);
  }

  @MessagePattern(PATTERNS.payroll.pay)
  pay(@Payload() request: PayPayrollRequest): Promise<PayrollDto> {
    return this.payroll.pay(request);
  }
}
