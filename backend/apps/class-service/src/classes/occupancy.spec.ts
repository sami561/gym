import { BadRequestException, ConflictException } from '@nestjs/common';
import { BookingStatus } from '@app/common';
import { OccupancyRow, decideBooking, groupOccupancy, planPromotions, summarize, waitlistPosition } from './occupancy';

let seq = 0;
const row = (status: BookingStatus, spotNumber: number | null = null, queuedMinute = 0, sessionId = 's1'): OccupancyRow => ({
  id: `b${++seq}`,
  sessionId,
  status,
  spotNumber,
  queuedAt: status === BookingStatus.WAITLISTED ? new Date(Date.UTC(2026, 10, 2, 10, queuedMinute)) : null,
  createdAt: new Date(Date.UTC(2026, 10, 1, 9, 0)),
});
const { BOOKED, ATTENDED, WAITLISTED, CANCELLED, NO_SHOW } = BookingStatus;
const plain = { capacity: 2, spotSelection: false, waitlistCapacity: 2 };
const spots = { capacity: 3, spotSelection: true, waitlistCapacity: 1 };

describe('occupancy', () => {
  it('counts booked + attended places, taken spots and the FIFO waitlist', () => {
    const late = row(WAITLISTED, null, 30);
    const early = row(WAITLISTED, null, 5);
    const occ = summarize([row(BOOKED, 2), row(ATTENDED, 1), late, early, row(CANCELLED, 3), row(NO_SHOW)]);
    expect(occ.booked).toBe(2);
    expect(occ.takenSpots).toEqual([1, 2]);
    expect(occ.waitlist.map((r) => r.id)).toEqual([early.id, late.id]);
    expect(waitlistPosition(occ, late.id)).toBe(2);
    expect(waitlistPosition(occ, 'nope')).toBeNull();
  });

  it('groups rows per session', () => {
    const grouped = groupOccupancy([row(BOOKED, null, 0, 'a'), row(BOOKED, null, 0, 'b'), row(WAITLISTED, null, 0, 'b')]);
    expect(grouped.get('a')?.booked).toBe(1);
    expect(grouped.get('b')?.waitlist).toHaveLength(1);
  });

  describe('decideBooking', () => {
    it('books while places remain', () => {
      expect(decideBooking(plain, summarize([row(BOOKED)]))).toEqual({ status: BOOKED, spotNumber: null });
    });

    it('requires a free spot in range when the class has numbered places', () => {
      const occ = summarize([row(BOOKED, 1)]);
      expect(() => decideBooking(spots, occ)).toThrow('Choisissez une place (1 à 3).');
      expect(() => decideBooking(spots, occ, 4)).toThrow(BadRequestException);
      expect(() => decideBooking(spots, occ, 1)).toThrow('Cette place est déjà prise.');
      expect(decideBooking(spots, occ, 3)).toEqual({ status: BOOKED, spotNumber: 3 });
    });

    it('queues on the waitlist when full, keeping the wished spot', () => {
      const occ = summarize([row(BOOKED, 1), row(BOOKED, 2), row(BOOKED, 3)]);
      expect(decideBooking(spots, occ, 2)).toEqual({ status: WAITLISTED, spotNumber: 2 });
      expect(decideBooking(spots, occ)).toEqual({ status: WAITLISTED, spotNumber: null });
      expect(decideBooking(plain, summarize([row(BOOKED), row(BOOKED)]), 1)).toEqual({ status: WAITLISTED, spotNumber: null });
    });

    it('refuses when the waitlist is full or disabled', () => {
      const full = summarize([row(BOOKED, 1), row(BOOKED, 2), row(BOOKED, 3), row(WAITLISTED)]);
      expect(() => decideBooking(spots, full)).toThrow("Liste d'attente complète.");
      expect(() => decideBooking({ ...plain, waitlistCapacity: 0 }, summarize([row(BOOKED), row(BOOKED)]))).toThrow(
        new ConflictException('Séance complète.'),
      );
    });
  });

  describe('planPromotions', () => {
    it('promotes FIFO into the free places only', () => {
      const first = row(WAITLISTED, null, 1);
      const second = row(WAITLISTED, null, 2);
      const occ = summarize([row(BOOKED), second, first]);
      expect(planPromotions({ ...plain, capacity: 2 }, occ)).toEqual([{ bookingId: first.id, spotNumber: null }]);
      expect(planPromotions({ ...plain, capacity: 3 }, occ).map((p) => p.bookingId)).toEqual([first.id, second.id]);
      expect(planPromotions({ ...plain, capacity: 1 }, occ)).toEqual([]);
    });

    it('keeps the wished spot when free, otherwise gives the first free spot', () => {
      const wantsTwo = row(WAITLISTED, 2, 1);
      const wantsOne = row(WAITLISTED, 1, 2);
      const occ = summarize([row(BOOKED, 1), wantsTwo, wantsOne]);
      expect(planPromotions({ ...spots, capacity: 3 }, occ)).toEqual([
        { bookingId: wantsTwo.id, spotNumber: 2 },
        { bookingId: wantsOne.id, spotNumber: 3 },
      ]);
    });
  });
});
