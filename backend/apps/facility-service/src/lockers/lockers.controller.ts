import { Controller, Logger } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import {
  AssignLockerRequest,
  CreateLockersRequest,
  EVENTS,
  IdRequest,
  ListLockersRequest,
  LockerDto,
  MemberDeletedEvent,
  MemberUpdatedEvent,
  OkResult,
  PATTERNS,
  fullName,
} from '@app/common';
import { LockersService } from './lockers.service';

@Controller()
export class LockersController {
  private readonly logger = new Logger(LockersController.name);

  constructor(private readonly lockers: LockersService) {}

  @MessagePattern(PATTERNS.lockers.list)
  list(@Payload() request: ListLockersRequest): Promise<LockerDto[]> {
    return this.lockers.list(request ?? {});
  }

  @MessagePattern(PATTERNS.lockers.create)
  create(@Payload() request: CreateLockersRequest): Promise<LockerDto[]> {
    return this.lockers.create(request);
  }

  @MessagePattern(PATTERNS.lockers.assign)
  assign(@Payload() request: AssignLockerRequest): Promise<LockerDto> {
    return this.lockers.assign(request);
  }

  @MessagePattern(PATTERNS.lockers.remove)
  remove(@Payload() request: IdRequest): Promise<OkResult> {
    return this.lockers.remove(request);
  }

  @EventPattern(EVENTS.memberDeleted)
  async onMemberDeleted(@Payload() event: MemberDeletedEvent): Promise<void> {
    try {
      const released = await this.lockers.releaseMember(event.memberId);
      if (released) this.logger.log(`${released} casier(s) libéré(s) après suppression du membre ${event.memberId}`);
    } catch (err) {
      this.logger.warn(`member.deleted non traité : ${(err as Error).message}`);
    }
  }

  @EventPattern(EVENTS.memberUpdated)
  async onMemberUpdated(@Payload() event: MemberUpdatedEvent): Promise<void> {
    try {
      await this.lockers.renameMember(event.memberId, fullName(event));
    } catch (err) {
      this.logger.warn(`member.updated non traité : ${(err as Error).message}`);
    }
  }
}
