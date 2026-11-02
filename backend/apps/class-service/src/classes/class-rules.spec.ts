import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  assertCapacity,
  assertRepeatWeeks,
  assertUuid,
  averageFillRate,
  dayRange,
  normaliseColor,
  parseDateTime,
  shiftWeeks,
} from './class-rules';

describe('class rules', () => {
  it('shifts a session by whole weeks keeping the wall-clock time', () => {
    const start = new Date(2026, 10, 2, 18, 30);
    const shifted = shiftWeeks(start, 2);
    expect(shifted.getDate()).toBe(16);
    expect(shifted.getHours()).toBe(18);
    expect(shifted.getMinutes()).toBe(30);
    expect(start.getDate()).toBe(2);
  });

  it('validates capacity, repetition and colors', () => {
    expect(assertCapacity(12)).toBe(12);
    expect(() => assertCapacity(0)).toThrow(BadRequestException);
    expect(() => assertCapacity(2.5)).toThrow(BadRequestException);
    expect(assertRepeatWeeks(undefined)).toBe(0);
    expect(() => assertRepeatWeeks(13)).toThrow(BadRequestException);
    expect(normaliseColor('#e10600')).toBe('#E10600');
    expect(normaliseColor('')).toBeNull();
    expect(() => normaliseColor('red')).toThrow(BadRequestException);
  });

  it('rejects malformed dates and ids', () => {
    expect(() => parseDateTime('demain', 'startsAt')).toThrow(BadRequestException);
    expect(parseDateTime('2026-11-02T18:00:00.000Z', 'startsAt').toISOString()).toBe('2026-11-02T18:00:00.000Z');
    expect(() => assertUuid('42', 'Séance introuvable.')).toThrow(NotFoundException);
  });

  it('computes the local day range and refuses impossible dates', () => {
    const { start, end } = dayRange('2026-11-02');
    expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()]).toEqual([2026, 10, 2, 0]);
    expect(end.getDate()).toBe(3);
    expect(() => dayRange('2026-02-30')).toThrow(BadRequestException);
  });

  it('averages the fill rate, capping overbooked sessions at 100%', () => {
    const sessions = [
      { id: 'a', capacity: 10 },
      { id: 'b', capacity: 4 },
    ];
    const booked = new Map([
      ['a', 5],
      ['b', 6],
    ]);
    expect(averageFillRate(sessions, booked)).toBe(0.75);
    expect(averageFillRate([], booked)).toBe(0);
  });
});
