import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { HealthResult, PATTERNS, TrainingStats, healthResult } from '@app/common';
import { StatsService } from './stats/stats.service';

@Controller()
export class AppController {
  constructor(private readonly stats: StatsService) {}

  @MessagePattern(PATTERNS.trainingStats.summary)
  summary(): Promise<TrainingStats> {
    return this.stats.summary();
  }

  @MessagePattern(PATTERNS.trainingStats.health)
  health(): HealthResult {
    return healthResult('training-service');
  }
}
