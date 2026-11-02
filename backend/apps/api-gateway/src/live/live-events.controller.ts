import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { AccessLogDto, EVENTS } from '@app/common';
import { LiveGateway } from './live.gateway';

@Controller()
export class LiveEventsController {
  constructor(private readonly live: LiveGateway) {}

  @EventPattern(EVENTS.accessLogged)
  onAccessLogged(@Payload() log: AccessLogDto): void {
    this.live.broadcastAccess(log);
  }
}
