import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AccessLogDto, AccessResult, BookingStatus, EVENTS, EventBus, envInt } from '@app/common';
import { NO_SHOW_GRACE_MINUTES, REMINDER_MINUTES, loadBookingPolicy } from '../classes/booking-policy';
import { toBookingEvent } from '../mappers';
import { Booking } from './booking.entity';

const DEFAULT_SWEEP_SECONDS = 300;

/** Door check-ins → ATTENDED; every 5 minutes: reminders 2 h before, NO_SHOW 15 min after the end. */
@Injectable()
export class AttendanceService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AttendanceService.name);
  private sweeping = false;

  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    private readonly events: EventBus,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    const seconds = Math.max(5, envInt('BOOKING_SWEEP_SECONDS', DEFAULT_SWEEP_SECONDS));
    this.scheduler.addInterval('booking-sweep', setInterval(() => void this.sweep(), seconds * 1000));
  }

  /** A GRANTED door access from `checkinWindowMinutes` before the start until the end checks the member in. */
  async checkIn(log: AccessLogDto): Promise<number> {
    if (log.result !== AccessResult.GRANTED || !log.memberId) return 0;
    const parsed = new Date(log.createdAt);
    const at = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const windowMs = loadBookingPolicy().checkinWindowMinutes * 60_000;
    const due = await this.bookings
      .createQueryBuilder('b')
      .innerJoin('b.session', 's')
      .where('b.memberId = :memberId', { memberId: log.memberId })
      .andWhere('b.status = :booked', { booked: BookingStatus.BOOKED })
      .andWhere('s.startsAt <= :latestStart', { latestStart: new Date(at.getTime() + windowMs) })
      .andWhere('s.endsAt >= :at', { at })
      .getMany();
    if (!due.length) return 0;
    await this.bookings.update(
      { id: In(due.map((b) => b.id)), status: BookingStatus.BOOKED },
      { status: BookingStatus.ATTENDED, checkedInAt: at, strikeAt: null },
    );
    this.logger.log(`Checked in ${due.length} booking(s) of member ${log.memberId}`);
    return due.length;
  }

  async sweep(): Promise<{ reminders: number; noShows: number }> {
    if (this.sweeping) return { reminders: 0, noShows: 0 };
    this.sweeping = true;
    try {
      const reminders = await this.sendReminders();
      const noShows = await this.markNoShows();
      if (reminders || noShows) this.logger.log(`Sweep: ${reminders} reminder(s), ${noShows} no-show(s)`);
      return { reminders, noShows };
    } catch (err) {
      this.logger.error(`Booking sweep failed: ${(err as Error).message}`);
      return { reminders: 0, noShows: 0 };
    } finally {
      this.sweeping = false;
    }
  }

  /** Claims each due booking once (SKIP LOCKED: safe with several replicas) then publishes the reminder. */
  private async sendReminders(): Promise<number> {
    const result: unknown = await this.bookings.query(
      `UPDATE "bookings" SET "reminderSentAt" = now()
        WHERE "id" IN (
          SELECT b."id" FROM "bookings" b
            JOIN "class_sessions" s ON s."id" = b."sessionId"
           WHERE b."status" = 'BOOKED' AND b."reminderSentAt" IS NULL
             AND s."startsAt" > now() AND s."startsAt" <= now() + make_interval(mins => $1::int)
           FOR UPDATE OF b SKIP LOCKED)
      RETURNING "id"`,
      [REMINDER_MINUTES],
    );
    const ids = returnedIds(result);
    if (!ids.length) return 0;
    const rows = await this.bookings.find({ where: { id: In(ids) }, relations: { session: true } });
    for (const booking of rows) this.events.publish(EVENTS.bookingReminder, toBookingEvent(booking, booking.session));
    return rows.length;
  }

  private async markNoShows(): Promise<number> {
    const result: unknown = await this.bookings.query(
      `UPDATE "bookings" SET "status" = 'NO_SHOW', "strikeAt" = now()
        WHERE "status" = 'BOOKED'
          AND "sessionId" IN (
            SELECT "id" FROM "class_sessions" WHERE "endsAt" <= now() - make_interval(mins => $1::int))
      RETURNING "id"`,
      [NO_SHOW_GRACE_MINUTES],
    );
    return returnedIds(result).length;
  }
}

/** TypeORM returns [rows, affectedCount] for UPDATE ... RETURNING on Postgres. */
function returnedIds(result: unknown): string[] {
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  return Array.isArray(rows) ? (rows as { id: string }[]).map((row) => row.id) : [];
}
