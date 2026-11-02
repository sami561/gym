import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { HealthResult, PATTERNS, StaffStats, healthResult } from '@app/common';
import { StaffStatsService } from './stats/staff-stats.service';

@Controller()
export class AppController {
  constructor(private readonly stats: StaffStatsService) {}

  @MessagePattern(PATTERNS.staffStats.health)
  health(): HealthResult {
    return healthResult('staff-service');
  }

  @MessagePattern(PATTERNS.staffStats.summary)
  summary(): Promise<StaffStats> {
    return this.stats.summary();
  }
}
