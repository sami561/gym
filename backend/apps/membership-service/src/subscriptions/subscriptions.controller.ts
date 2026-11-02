import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateSubscriptionRequest,
  FreezeSubscriptionRequest,
  PATTERNS,
  UnfreezeSubscriptionRequest,
  UpdateSubscriptionRequest,
} from '@app/common';
import { SubscriptionsService } from './subscriptions.service';

@Controller()
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @MessagePattern(PATTERNS.subscriptions.create)
  create(@Payload() req: CreateSubscriptionRequest) {
    return this.subscriptions.create(req);
  }

  @MessagePattern(PATTERNS.subscriptions.update)
  update(@Payload() req: UpdateSubscriptionRequest) {
    return this.subscriptions.update(req);
  }

  @MessagePattern(PATTERNS.subscriptions.freeze)
  freeze(@Payload() req: FreezeSubscriptionRequest) {
    return this.subscriptions.freeze(req);
  }

  @MessagePattern(PATTERNS.subscriptions.unfreeze)
  unfreeze(@Payload() req: UnfreezeSubscriptionRequest) {
    return this.subscriptions.unfreeze(req);
  }
}
