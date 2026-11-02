import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { OkResult, PATTERNS, RegisterPushRequest } from '@app/common';
import { PushService } from './push.service';

@Controller()
export class PushController {
  constructor(private readonly push: PushService) {}

  @MessagePattern(PATTERNS.notifications.registerPush)
  register(@Payload() request: RegisterPushRequest): Promise<OkResult> {
    return this.push.register(request);
  }
}
