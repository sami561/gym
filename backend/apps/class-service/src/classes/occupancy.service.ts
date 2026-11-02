import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { BookingStatus, EVENTS, EventBus } from '@app/common';
import { Booking } from '../bookings/booking.entity';
import { toBookingEvent } from '../mappers';
import { ClassSession } from './class-session.entity';
import { OCCUPANCY_STATUSES, Occupancy, groupOccupancy, planPromotions, summarize } from './occupancy';

/** Places / spots / waitlist of sessions, shared by the class and booking flows. */
@Injectable()
export class OccupancyService {
  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    private readonly events: EventBus,
  ) {}

  /** BOOKED, ATTENDED and WAITLISTED rows of the sessions. */
  rows(sessionIds: string[], manager?: EntityManager): Promise<Booking[]> {
    if (!sessionIds.length) return Promise.resolve([]);
    const repo = manager ? manager.getRepository(Booking) : this.bookings;
    return repo.find({ where: { sessionId: In(sessionIds), status: In(OCCUPANCY_STATUSES) } });
  }

  async load(sessionIds: string[]): Promise<Map<string, Occupancy<Booking>>> {
    return groupOccupancy(await this.rows(sessionIds));
  }

  async loadOne(sessionId: string, manager?: EntityManager): Promise<Occupancy<Booking>> {
    return summarize(await this.rows([sessionId], manager));
  }

  /** The member's booking row (any status) per session. */
  async memberBookings(sessionIds: string[], memberId: string): Promise<Map<string, Booking>> {
    if (!sessionIds.length) return new Map();
    const rows = await this.bookings.find({ where: { sessionId: In(sessionIds), memberId } });
    return new Map(rows.map((b) => [b.sessionId, b]));
  }

  /** Row lock on the session: every change of places/spots/waitlist happens under it. */
  async lockSession(manager: EntityManager, sessionId: string): Promise<ClassSession> {
    const session = await manager.findOne(ClassSession, {
      where: { id: sessionId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!session) throw new NotFoundException('Séance introuvable.');
    return session;
  }

  /** Moves waitlisted members (FIFO) into free places; call with the session locked. */
  async promote(manager: EntityManager, session: ClassSession, now: Date = new Date()): Promise<Booking[]> {
    if (session.startsAt <= now) return [];
    const rows = await this.rows([session.id], manager);
    const plan = planPromotions(session, summarize(rows));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const promoted: Booking[] = [];
    for (const step of plan) {
      const booking = byId.get(step.bookingId);
      if (!booking) continue;
      booking.status = BookingStatus.BOOKED;
      booking.spotNumber = step.spotNumber;
      booking.queuedAt = null;
      promoted.push(await manager.save(booking));
    }
    return promoted;
  }

  /** Publish after the transaction committed. */
  publishPromoted(promoted: Booking[], session: ClassSession): void {
    for (const booking of promoted) this.events.publish(EVENTS.bookingPromoted, toBookingEvent(booking, session));
  }
}
