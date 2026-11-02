import { BadRequestException, ConflictException } from '@nestjs/common';
import { BookingStatus } from '@app/common';

/** Bookings that hold a place in the session. */
export const HOLDING_STATUSES = [BookingStatus.BOOKED, BookingStatus.ATTENDED];
/** Rows that matter for places, spots and the waitlist. */
export const OCCUPANCY_STATUSES = [...HOLDING_STATUSES, BookingStatus.WAITLISTED];
/** Statuses that count as a strike against the member. */
export const STRIKE_STATUSES = [BookingStatus.NO_SHOW, BookingStatus.LATE_CANCELLED];

export interface OccupancyRow {
  id: string;
  sessionId: string;
  status: BookingStatus;
  spotNumber: number | null;
  queuedAt: Date | null;
  createdAt: Date;
}

export interface SessionShape {
  capacity: number;
  spotSelection: boolean;
  waitlistCapacity: number;
}

export interface Occupancy<R extends OccupancyRow = OccupancyRow> {
  booked: number;
  takenSpots: number[];
  /** WAITLISTED rows, first in line first. */
  waitlist: R[];
}

const queueTime = (row: OccupancyRow) => (row.queuedAt ?? row.createdAt).getTime();

export function fifo(a: OccupancyRow, b: OccupancyRow): number {
  return queueTime(a) - queueTime(b) || a.id.localeCompare(b.id);
}

export function summarize<R extends OccupancyRow>(rows: R[]): Occupancy<R> {
  const holding = rows.filter((r) => HOLDING_STATUSES.includes(r.status));
  const takenSpots = [
    ...new Set(holding.map((r) => r.spotNumber).filter((n): n is number => typeof n === 'number')),
  ].sort((a, b) => a - b);
  const waitlist = rows.filter((r) => r.status === BookingStatus.WAITLISTED).sort(fifo);
  return { booked: holding.length, takenSpots, waitlist };
}

export function groupOccupancy<R extends OccupancyRow>(rows: R[]): Map<string, Occupancy<R>> {
  const bySession = new Map<string, R[]>();
  for (const row of rows) {
    const list = bySession.get(row.sessionId) ?? [];
    list.push(row);
    bySession.set(row.sessionId, list);
  }
  return new Map([...bySession].map(([sessionId, list]) => [sessionId, summarize(list)]));
}

export const EMPTY_OCCUPANCY: Occupancy = { booked: 0, takenSpots: [], waitlist: [] };

/** 1-based position on the waitlist, null when the booking is not waitlisted. */
export function waitlistPosition(occupancy: Occupancy | undefined, bookingId: string): number | null {
  const index = occupancy?.waitlist.findIndex((r) => r.id === bookingId) ?? -1;
  return index >= 0 ? index + 1 : null;
}

export function assertSpotNumber(spot: unknown, capacity: number): number {
  if (typeof spot !== 'number' || !Number.isInteger(spot) || spot < 1 || spot > capacity) {
    throw new BadRequestException(`Place invalide (1 à ${capacity}).`);
  }
  return spot;
}

export function firstFreeSpot(taken: Set<number>, capacity: number): number | null {
  for (let spot = 1; spot <= capacity; spot++) if (!taken.has(spot)) return spot;
  return null;
}

/**
 * Outcome of a new booking: BOOKED while places remain (spot required and free when the session
 * has spot selection), otherwise WAITLISTED if the waitlist has room (the requested spot is kept
 * as a wish for the promotion).
 */
export function decideBooking(
  session: SessionShape,
  occupancy: Occupancy,
  requestedSpot?: number | null,
): { status: BookingStatus.BOOKED | BookingStatus.WAITLISTED; spotNumber: number | null } {
  const wantsSpot = requestedSpot !== undefined && requestedSpot !== null;
  if (occupancy.booked < session.capacity) {
    if (!session.spotSelection) return { status: BookingStatus.BOOKED, spotNumber: null };
    if (!wantsSpot) throw new BadRequestException(`Choisissez une place (1 à ${session.capacity}).`);
    const spot = assertSpotNumber(requestedSpot, session.capacity);
    if (occupancy.takenSpots.includes(spot)) throw new ConflictException('Cette place est déjà prise.');
    return { status: BookingStatus.BOOKED, spotNumber: spot };
  }
  if (session.waitlistCapacity <= 0) throw new ConflictException('Séance complète.');
  if (occupancy.waitlist.length >= session.waitlistCapacity) {
    throw new ConflictException("Liste d'attente complète.");
  }
  const spot = session.spotSelection && wantsSpot ? assertSpotNumber(requestedSpot, session.capacity) : null;
  return { status: BookingStatus.WAITLISTED, spotNumber: spot };
}

/**
 * Waitlisted bookings to promote (FIFO) while places are free. With spot selection the member keeps
 * the spot they asked for when it is free, otherwise gets the first free spot.
 */
export function planPromotions(
  session: SessionShape,
  occupancy: Occupancy,
): { bookingId: string; spotNumber: number | null }[] {
  const plan: { bookingId: string; spotNumber: number | null }[] = [];
  const taken = new Set(occupancy.takenSpots);
  let free = session.capacity - occupancy.booked;
  for (const row of occupancy.waitlist) {
    if (free <= 0) break;
    let spot: number | null = null;
    if (session.spotSelection) {
      const wish = row.spotNumber;
      spot = wish && wish <= session.capacity && !taken.has(wish) ? wish : firstFreeSpot(taken, session.capacity);
      if (spot === null) break;
      taken.add(spot);
    }
    plan.push({ bookingId: row.id, spotNumber: spot });
    free--;
  }
  return plan;
}
