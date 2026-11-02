import { Controller, Logger } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import {
  BookingDto,
  ClassSessionDto,
  ClassStats,
  ClassStatsRequest,
  CreateClassRequest,
  EVENTS,
  IdRequest,
  ListClassesRequest,
  OkResult,
  PATTERNS,
  UpdateClassRequest,
  UserEvent,
  fullName,
} from '@app/common';
import { ClassesService } from './classes.service';

@Controller()
export class ClassesController {
  private readonly logger = new Logger(ClassesController.name);

  constructor(private readonly classes: ClassesService) {}

  @MessagePattern(PATTERNS.classes.list)
  list(@Payload() request: ListClassesRequest): Promise<ClassSessionDto[]> {
    return this.classes.list(request ?? {});
  }

  @MessagePattern(PATTERNS.classes.create)
  create(@Payload() request: CreateClassRequest): Promise<ClassSessionDto[]> {
    return this.classes.create(request);
  }

  @MessagePattern(PATTERNS.classes.update)
  update(@Payload() request: UpdateClassRequest): Promise<ClassSessionDto> {
    return this.classes.update({ id: request.id, data: request.data ?? {} });
  }

  @MessagePattern(PATTERNS.classes.remove)
  remove(@Payload() request: IdRequest): Promise<OkResult> {
    return this.classes.remove(request);
  }

  @MessagePattern(PATTERNS.classes.bookings)
  bookings(@Payload() request: IdRequest): Promise<BookingDto[]> {
    return this.classes.sessionBookings(request);
  }

  @MessagePattern(PATTERNS.classes.stats)
  stats(@Payload() request: ClassStatsRequest): Promise<ClassStats> {
    return this.classes.stats(request ?? {});
  }

  @EventPattern(EVENTS.userUpdated)
  async onUserUpdated(@Payload() event: UserEvent): Promise<void> {
    try {
      await this.classes.onCoachUpdated(event.userId, fullName(event));
    } catch (err) {
      this.logger.error(`user.updated not applied: ${(err as Error).message}`);
    }
  }
}
