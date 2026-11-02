import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  DailyReportRequest,
  KpiPeriodRequest,
  ExpiredRequest,
  ExpiringRequest,
  PATTERNS,
  RecipientsRequest,
  RevenueRequest,
  healthResult,
} from '@app/common';
import { StatsService } from './stats.service';

@Controller()
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @MessagePattern(PATTERNS.membershipStats.summary)
  summary() {
    return this.stats.summary();
  }

  @MessagePattern(PATTERNS.membershipStats.analytics)
  analytics() {
    return this.stats.analytics();
  }

  @MessagePattern(PATTERNS.membershipStats.kpis)
  kpis(@Payload() req: KpiPeriodRequest) {
    return this.stats.kpis(req ?? {});
  }

  @MessagePattern(PATTERNS.membershipStats.revenue)
  revenue(@Payload() req: RevenueRequest) {
    return this.stats.revenue(req ?? {});
  }

  @MessagePattern(PATTERNS.membershipStats.expiring)
  expiring(@Payload() req: ExpiringRequest) {
    return this.stats.expiring(req ?? {});
  }

  @MessagePattern(PATTERNS.membershipStats.planMix)
  planMix() {
    return this.stats.planMix();
  }

  @MessagePattern(PATTERNS.membershipAutomation.recipients)
  recipients(@Payload() req: RecipientsRequest) {
    return this.stats.recipients(req ?? {});
  }

  @MessagePattern(PATTERNS.membershipAutomation.birthdays)
  birthdays() {
    return this.stats.birthdays();
  }

  @MessagePattern(PATTERNS.membershipAutomation.expired)
  expired(@Payload() req: ExpiredRequest) {
    return this.stats.expired(req ?? {});
  }

  @MessagePattern(PATTERNS.membershipAutomation.dailyReport)
  dailyReport(@Payload() req: DailyReportRequest) {
    return this.stats.dailyReport(req ?? {});
  }

  @MessagePattern(PATTERNS.members.health)
  health() {
    return healthResult('membership-service');
  }
}
