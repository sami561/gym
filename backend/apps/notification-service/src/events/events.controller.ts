import { Controller, Logger } from '@nestjs/common';
import { BaseRpcContext, Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { EVENTS, MemberDeletedEvent, WEBHOOK_EVENTS } from '@app/common';
import { WebhooksService } from '../webhooks/webhooks.service';
import { PushService } from '../push/push.service';
import { pushFor } from '../push/push-messages';

@Controller()
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  constructor(
    private readonly webhooks: WebhooksService,
    private readonly push: PushService,
  ) {}

  /**
   * One subscription per entry of WEBHOOK_EVENTS (Nest expands the array), so a new event added
   * to that list is forwarded to n8n without touching this service. The first context argument
   * is the event name for both transports (Redis channel / NATS subject).
   */
  @EventPattern(WEBHOOK_EVENTS)
  async onWebhookEvent(@Payload() data: object, @Ctx() context: BaseRpcContext): Promise<void> {
    const event = String(context.getArgByIndex(0));
    await Promise.all([this.forward(event, data), this.notify(event, data)]);
  }

  @EventPattern(EVENTS.memberDeleted)
  async onMemberDeleted(@Payload() event: MemberDeletedEvent): Promise<void> {
    await this.forget(event.memberId);
  }

  @EventPattern(EVENTS.userDeleted)
  async onUserDeleted(@Payload() event: { userId: string }): Promise<void> {
    await this.forget(event.userId);
  }

  private async forward(event: string, data: object): Promise<void> {
    try {
      await this.webhooks.enqueue(event, data);
    } catch (err) {
      this.logger.error(`${event} not queued for n8n: ${(err as Error).message}`);
    }
  }

  private async notify(event: string, data: object): Promise<void> {
    const push = pushFor(event, data);
    if (!push?.userId) return;
    try {
      await this.push.sendToUser(push.userId, push.message);
    } catch (err) {
      this.logger.error(`${event} push not sent: ${(err as Error).message}`);
    }
  }

  private async forget(userId: string): Promise<void> {
    try {
      await this.push.removeUser(userId);
    } catch (err) {
      this.logger.error(`Push tokens of ${userId} not removed: ${(err as Error).message}`);
    }
  }
}
