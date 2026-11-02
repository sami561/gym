import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, PATTERNS, PayrollDto, Role, Roles, RpcClient, toActor } from '@app/common';
import { GeneratePayrollDto, ListPayrollQuery, PayPayrollDto, UpdatePayrollDto } from './staff.dto';

@ApiTags('Paie')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('payroll')
export class PayrollController {
  constructor(private readonly rpc: RpcClient) {}

  @Get()
  list(@Query() q: ListPayrollQuery) {
    return this.rpc.send<PayrollDto[]>(PATTERNS.payroll.list, q);
  }

  /** Creates or refreshes the DRAFT payslips of the month (PAID ones are never touched). */
  @Post('generate')
  generate(@Body() dto: GeneratePayrollDto) {
    return this.rpc.send<PayrollDto[]>(PATTERNS.payroll.generate, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePayrollDto) {
    return this.rpc.send<PayrollDto>(PATTERNS.payroll.update, { id, data: dto });
  }

  /** Marks the payslip PAID; commerce-service records the matching SALARY expense. */
  @Post(':id/pay')
  pay(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PayPayrollDto) {
    return this.rpc.send<PayrollDto>(PATTERNS.payroll.pay, { id, method: dto.method, actor: toActor(user) });
  }
}
