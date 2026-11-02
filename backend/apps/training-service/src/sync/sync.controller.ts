import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EVENTS, MemberDeletedEvent, MemberUpdatedEvent, UserEvent, fullName } from '@app/common';
import { WorkoutProgram } from '../programs/workout-program.entity';
import { Measurement } from '../measurements/measurement.entity';
import { PtSession } from '../pt-sessions/pt-session.entity';

/** Keeps denormalised member / coach names in sync and removes data of deleted members. */
@Controller()
export class SyncController {
  private readonly logger = new Logger(SyncController.name);

  constructor(
    @InjectRepository(WorkoutProgram) private readonly programs: Repository<WorkoutProgram>,
    @InjectRepository(Measurement) private readonly measurements: Repository<Measurement>,
    @InjectRepository(PtSession) private readonly sessions: Repository<PtSession>,
  ) {}

  @EventPattern(EVENTS.memberUpdated)
  async onMemberUpdated(@Payload() event: MemberUpdatedEvent): Promise<void> {
    try {
      const memberName = fullName(event);
      await this.programs.update({ memberId: event.memberId }, { memberName });
      await this.sessions.update({ memberId: event.memberId }, { memberName });
    } catch (err) {
      this.logger.error(`member.updated ${event?.memberId}: ${(err as Error).message}`);
    }
  }

  @EventPattern(EVENTS.memberDeleted)
  async onMemberDeleted(@Payload() event: MemberDeletedEvent): Promise<void> {
    try {
      await this.programs.delete({ memberId: event.memberId });
      await this.measurements.delete({ memberId: event.memberId });
      await this.sessions.delete({ memberId: event.memberId });
    } catch (err) {
      this.logger.error(`member.deleted ${event?.memberId}: ${(err as Error).message}`);
    }
  }

  @EventPattern(EVENTS.userUpdated)
  async onUserUpdated(@Payload() event: UserEvent): Promise<void> {
    try {
      const coachName = fullName(event);
      await this.programs.update({ coachId: event.userId }, { coachName });
      await this.sessions.update({ coachId: event.userId }, { coachName });
    } catch (err) {
      this.logger.error(`user.updated ${event?.userId}: ${(err as Error).message}`);
    }
  }
}
