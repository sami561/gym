import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { HealthResult, PATTERNS, healthResult } from '@app/common';

@Controller()
export class AppController {
  @MessagePattern(PATTERNS.notifications.health)
  health(): HealthResult {
    return healthResult('notification-service');
  }
}
