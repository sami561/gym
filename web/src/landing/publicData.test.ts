import { describe, expect, it } from 'vitest';
import type { ClassSessionDto, PlanDto } from '../api/types';
import { FALLBACK_PLANS } from '../lib/fallbacks';
import { plansOnSale } from './plansOnSale';
import { scheduleDays } from './scheduleDays';

const plan = (overrides: Partial<PlanDto>): PlanDto => ({
  id: 'p-month',
  name: 'Mensuel',
  description: null,
  durationDays: 30,
  price: 90,
  features: [],
  isFeatured: false,
  isActive: true,
  sortOrder: 1,
  ...overrides,
});

describe('plans on the website ("Pick your pace")', () => {
  it('shows the prices set in the admin, in their display order', () => {
    const { plans, fromApi } = plansOnSale([
      plan({ id: 'p-year', name: 'Annuel', durationDays: 365, price: 850, sortOrder: 3 }),
      plan({ id: 'p-month', price: 95.5 }),
    ]);
    expect(fromApi).toBe(true);
    expect(plans.map((p) => [p.name, p.price])).toEqual([
      ['Mensuel', 95.5],
      ['Annuel', 850],
    ]);
  });

  it('drops plans taken off sale', () => {
    expect(plansOnSale([plan({ isActive: false }), plan({ id: 'p-q', name: 'Trimestriel', durationDays: 90 })]).plans.map((p) => p.id)).toEqual(['p-q']);
  });

  it('never replaces a real answer by the price-less fallback, even an empty one', () => {
    expect(plansOnSale([])).toEqual({ plans: [], fromApi: true });
    expect(plansOnSale([plan({ isActive: false })])).toEqual({ plans: [], fromApi: true });
  });

  it('uses the fallback (no invented price) only while the API has not answered', () => {
    const { plans, fromApi } = plansOnSale(undefined);
    expect(fromApi).toBe(false);
    expect(plans).toBe(FALLBACK_PLANS);
    expect(plans.every((p) => p.price === null)).toBe(true);
  });
});

const session = (id: string, startsAt: string, endsAt: string): ClassSessionDto => ({
  id,
  title: id,
  description: null,
  coachId: null,
  coachName: null,
  room: null,
  color: null,
  startsAt,
  endsAt,
  capacity: 20,
  bookedCount: 0,
  spotsLeft: 20,
  waitlistCount: 0,
  waitlistCapacity: 10,
  spotSelection: false,
  takenSpots: [],
  bookingOpensAt: startsAt,
  bookingClosesAt: startsAt,
  cancelDeadline: startsAt,
});

describe('class schedule on the website', () => {
  const now = new Date('2026-11-03T10:00:00.000Z'); // Tuesday 11:00 in Tunis

  it('lists 7 gym days from today with their classes in start order', () => {
    const days = scheduleDays(
      [
        session('cycling', '2026-11-03T17:30:00.000Z', '2026-11-03T18:15:00.000Z'),
        session('pump', '2026-11-03T06:00:00.000Z', '2026-11-03T07:00:00.000Z'),
        session('stretch', '2026-11-09T09:00:00.000Z', '2026-11-09T09:50:00.000Z'),
        session('next-week', '2026-11-10T09:00:00.000Z', '2026-11-10T10:00:00.000Z'),
      ],
      now,
    );
    expect(days.map((d) => d.key)).toEqual(['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09']);
    expect(days[0].sessions.map((s) => s.id)).toEqual(['pump', 'cycling']);
    expect(days[6].sessions.map((s) => s.id)).toEqual(['stretch']);
    expect(days.flatMap((d) => d.sessions).some((s) => s.id === 'next-week')).toBe(false);
  });

  it('puts a class on its day in Tunis, like the admin planning', () => {
    // 23:30 UTC on Thursday is 00:30 on Friday at the gym.
    const days = scheduleDays([session('late', '2026-11-05T23:30:00.000Z', '2026-11-06T00:30:00.000Z')], now);
    expect(days.find((d) => d.key === '2026-11-06')?.sessions.map((s) => s.id)).toEqual(['late']);
    expect(days.find((d) => d.key === '2026-11-05')?.sessions).toEqual([]);
  });
});
