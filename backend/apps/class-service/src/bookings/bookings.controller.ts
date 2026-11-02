import { Controller, Logger } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import {
  AccessLogDto,
  BookingDto,
  BookingPolicy,
  CancelBookingRequest,
  CreateBookingRequest,
  EVENTS,
  MemberBookingStanding,
  MemberDeletedEvent,
  MemberUpdatedEvent,
  MyBookingsRequest,
  PATTERNS,
  SetBookingStatusRequest,
  fullName,
} from '@app/common';
import { AttendanceService } from './attendance.service';
import { BookingsService } from './bookings.service';

@Controller()
export class BookingsController {
  private readonly logger = new Logger(BookingsController.name);

  constructor(
    private readonly bookings: BookingsService,
    private readonly attendance: AttendanceService,
  ) {}

  @MessagePattern(PATTERNS.bookings.create)
  create(@Payload() request: CreateBookingRequest): Promise<BookingDto> {
    return this.bookings.create(request);
  }

  @MessagePattern(PATTERNS.bookings.cancel)
  cancel(@Payload() request: CancelBookingRequest): Promise<BookingDto> {
    return this.bookings.cancel(request);
  }

  @MessagePattern(PATTERNS.bookings.mine)
  mine(@Payload() request: MyBookingsRequest): Promise<BookingDto[]> {
    return this.bookings.mine(request);
  }

  @MessagePattern(PATTERNS.bookings.setStatus)
  setStatus(@Payload() request: SetBookingStatusRequest): Promise<BookingDto> {
    return this.bookings.setStatus(request);
  }

  @MessagePattern(PATTERNS.bookings.policy)
  policy(): BookingPolicy {
    return this.bookings.policy();
  }

  @MessagePattern(PATTERNS.bookings.standing)
  standing(@Payload() request: { memberId: string }): Promise<MemberBookingStanding> {
    return this.bookings.standing(request ?? { memberId: '' });
  }

  @EventPattern(EVENTS.accessLogged)
  async onAccessLogged(@Payload() log: AccessLogDto): Promise<void> {
    try {
      await this.attendance.checkIn(log);
    } catch (err) {
      this.logger.error(`access.logged not applied: ${(err as Error).message}`);
    }
  }

  @EventPattern(EVENTS.memberUpdated)
  async onMemberUpdated(@Payload() event: MemberUpdatedEvent): Promise<void> {
    try {
      await this.bookings.onMemberUpdated(event.memberId, fullName(event), event.email || null);
    } catch (err) {
      this.logger.error(`member.updated not applied: ${(err as Error).message}`);
    }
  }

  @EventPattern(EVENTS.memberDeleted)
  async onMemberDeleted(@Payload() event: MemberDeletedEvent): Promise<void> {
    try {
      await this.bookings.onMemberDeleted(event.memberId);
    } catch (err) {
      this.logger.error(`member.deleted not applied: ${(err as Error).message}`);
    }
  }
}
