import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EntitlementChangedEvent, EVENTS, MemberCreatedEvent, MemberDeletedEvent, MemberUpdatedEvent } from '@app/common';
import { AccessMembersService } from './access-members.service';

/** Keeps the member read-model in sync with membership-service events. */
@Controller()
export class AccessMembersController {
  private readonly logger = new Logger(AccessMembersController.name);

  constructor(private readonly members: AccessMembersService) {}

  @EventPattern(EVENTS.memberCreated)
  onMemberCreated(@Payload() event: MemberCreatedEvent): Promise<void> {
    return this.safely(EVENTS.memberCreated, () => this.members.upsertProfile(event));
  }

  @EventPattern(EVENTS.memberUpdated)
  onMemberUpdated(@Payload() event: MemberUpdatedEvent): Promise<void> {
    return this.safely(EVENTS.memberUpdated, () => this.members.upsertProfile(event));
  }

  @EventPattern(EVENTS.memberDeleted)
  onMemberDeleted(@Payload() event: MemberDeletedEvent): Promise<void> {
    return this.safely(EVENTS.memberDeleted, () => this.members.remove(event.memberId));
  }

  @EventPattern(EVENTS.entitlementChanged)
  onEntitlementChanged(@Payload() event: EntitlementChangedEvent): Promise<void> {
    return this.safely(EVENTS.entitlementChanged, () => this.members.upsertEntitlement(event));
  }

  private async safely(event: string, handler: () => Promise<void>): Promise<void> {
    try {
      await handler();
    } catch (err) {
      // member.created and member.entitlement-changed arrive together and may insert the
      // same row concurrently: the loser of that race simply applies its change again.
      if ((err as { code?: string }).code === '23505') {
        try {
          await handler();
          return;
        } catch (retryErr) {
          err = retryErr;
        }
      }
      // The 10-minute reconciliation repairs anything an event failed to apply.
      this.logger.error(`${event} not applied: ${(err as Error).message}`);
    }
  }
}
