import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { HealthResult, PATTERNS, healthResult } from '@app/common';

@Controller()
export class AppController {
  @MessagePattern(PATTERNS.finance.health)
  health(): HealthResult {
    return healthResult('commerce-service');
  }
}
