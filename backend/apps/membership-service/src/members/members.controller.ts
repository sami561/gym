import { Controller } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateMemberRequest,
  EVENTS,
  EntitlementsRequest,
  IdRequest,
  ListMembersRequest,
  PATTERNS,
  UpdateMemberRequest,
  UserEvent,
} from '@app/common';
import { MembersService } from './members.service';

@Controller()
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @MessagePattern(PATTERNS.members.create)
  create(@Payload() req: CreateMemberRequest) {
    return this.members.create(req);
  }

  @MessagePattern(PATTERNS.members.list)
  list(@Payload() req: ListMembersRequest) {
    return this.members.list(req ?? {});
  }

  @MessagePattern(PATTERNS.members.get)
  get(@Payload() req: IdRequest) {
    return this.members.get(req.id);
  }

  @MessagePattern(PATTERNS.members.profile)
  profile(@Payload() req: IdRequest) {
    return this.members.profile(req.id);
  }

  @MessagePattern(PATTERNS.members.update)
  update(@Payload() req: UpdateMemberRequest) {
    return this.members.update(req);
  }

  @MessagePattern(PATTERNS.members.remove)
  remove(@Payload() req: IdRequest) {
    return this.members.remove(req.id);
  }

  @MessagePattern(PATTERNS.members.entitlements)
  entitlements(@Payload() req: EntitlementsRequest) {
    return this.members.entitlements(req ?? {});
  }

  @EventPattern(EVENTS.userUpdated)
  onUserUpdated(@Payload() event: UserEvent) {
    return this.members.onUserUpdated(event);
  }

  @EventPattern(EVENTS.userDeleted)
  onUserDeleted(@Payload() event: { userId: string }) {
    return this.members.onUserDeleted(event.userId);
  }
}
