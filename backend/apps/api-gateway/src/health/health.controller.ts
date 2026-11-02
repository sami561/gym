import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PATTERNS, Public, RpcClient } from '@app/common';

const SERVICES: Record<string, string> = {
  auth: PATTERNS.auth.health,
  membership: PATTERNS.members.health,
  class: PATTERNS.classes.health,
  access: PATTERNS.access.health,
  notification: PATTERNS.notifications.health,
  staff: PATTERNS.staffStats.health,
  facility: PATTERNS.facilityStats.health,
  commerce: PATTERNS.finance.health,
  training: PATTERNS.trainingStats.health,
  workflow: PATTERNS.workflowStats.health,
};

@ApiTags('Santé')
@Controller('health')
export class HealthController {
  constructor(private readonly rpc: RpcClient) {}

  /** Pings every microservice over the bus (2 s timeout each). */
  @Public()
  @Get()
  async health() {
    const entries = await Promise.all(
      Object.entries(SERVICES).map(async ([name, pattern]) => {
        const up = await this.rpc
          .send(pattern, {}, 2_000)
          .then(() => true)
          .catch(() => false);
        return [name, up ? 'up' : 'down'] as const;
      }),
    );
    const services = Object.fromEntries(entries);
    const allUp = entries.every(([, status]) => status === 'up');
    return { status: allUp ? 'ok' : 'degraded', services };
  }
}
