import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CommerceKpisRequest, CommerceStats, FinanceSummary, FinanceSummaryRequest, PATTERNS } from '@app/common';
import { FinanceService } from './finance.service';
import { CommerceKpisResult } from './kpis';

@Controller()
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @MessagePattern(PATTERNS.finance.summary)
  summary(@Payload() request: FinanceSummaryRequest): Promise<FinanceSummary> {
    return this.finance.summary(request ?? {});
  }

  @MessagePattern(PATTERNS.finance.kpis)
  kpis(@Payload() request: CommerceKpisRequest): Promise<CommerceKpisResult> {
    return this.finance.kpis(request ?? {});
  }

  @MessagePattern(PATTERNS.finance.stats)
  stats(): Promise<CommerceStats> {
    return this.finance.stats();
  }
}
