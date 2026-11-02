import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { FacilityStats, HealthResult, PATTERNS, healthResult } from '@app/common';
import { FacilityStatsService } from './stats/facility-stats.service';

@Controller()
export class AppController {
  constructor(private readonly stats: FacilityStatsService) {}

  @MessagePattern(PATTERNS.facilityStats.health)
  health(): HealthResult {
    return healthResult('facility-service');
  }

  @MessagePattern(PATTERNS.facilityStats.summary)
  summary(): Promise<FacilityStats> {
    return this.stats.summary();
  }
}
