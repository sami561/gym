import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FinanceSummary, PATTERNS, Role, Roles, RpcClient } from '@app/common';
import { FinanceQuery } from './commerce.dto';

@ApiTags('Finance')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('finance')
export class FinanceController {
  constructor(private readonly rpc: RpcClient) {}

  /** Membership revenue + shop sales − expenses = profit, per month. */
  @Get('summary')
  summary(@Query() q: FinanceQuery) {
    return this.rpc.send<FinanceSummary>(PATTERNS.finance.summary, { months: q.months ?? 12 });
  }
}
