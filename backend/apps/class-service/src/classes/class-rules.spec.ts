import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  ScheduleSlot,
  assertCapacity,
  assertRepeatWeeks,
  assertReschedule,
  assertUuid,
  averageFillRate,
  dayRange,
  findScheduleConflict,
  normaliseColor,
  parseDateTime,
  roomKey,
  sameMinute,
  scheduleConflictMessage,
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

describe('rescheduling rules (Africa/Tunis)', () => {
  // Now: Tuesday 3 Nov 2026, 11:00 in Tunis (10:00 UTC).
  const now = new Date('2026-11-03T10:00:00.000Z');
  const span = (start: string, end: string) => ({ startsAt: new Date(start), endsAt: new Date(end) });
  const thursday = span('2026-11-05T17:00:00.000Z', '2026-11-05T18:00:00.000Z'); // 18:00–19:00

  it('compares times to the minute', () => {
    expect(sameMinute(new Date('2026-11-05T17:00:00.000Z'), new Date('2026-11-05T17:00:59.999Z'))).toBe(true);
    expect(sameMinute(new Date('2026-11-05T17:00:00.000Z'), new Date('2026-11-05T17:01:00.000Z'))).toBe(false);
  });

  it('moves a future session to another future slot', () => {
    expect(() => assertReschedule(thursday, span('2026-11-06T16:30:00.000Z', '2026-11-06T17:30:00.000Z'), now)).not.toThrow();
    // Unchanged times (seconds aside) are not a move, even for a past session.
    const past = span('2026-11-02T17:00:00.000Z', '2026-11-02T18:00:00.000Z');
    expect(() => assertReschedule(past, span('2026-11-02T17:00:30.000Z', '2026-11-02T18:00:00.000Z'), now)).not.toThrow();
  });

  it('refuses a start in the past', () => {
    expect(() => assertReschedule(thursday, span('2026-11-03T09:45:00.000Z', '2026-11-03T10:45:00.000Z'), now)).toThrow(
      new BadRequestException('Impossible de déplacer une séance dans le passé.'),
    );
    expect(() => assertReschedule(thursday, span('2026-11-03T10:00:00.000Z', '2026-11-03T11:00:00.000Z'), now)).toThrow(
      'Impossible de déplacer une séance dans le passé.',
    );
  });

  it('never moves the start of a session that started, and only moves its end forward while it runs', () => {
    const running = span('2026-11-03T09:30:00.000Z', '2026-11-03T10:30:00.000Z');
    expect(() => assertReschedule(running, span('2026-11-03T11:00:00.000Z', '2026-11-03T12:00:00.000Z'), now)).toThrow(
      'Cette séance a déjà commencé : elle ne peut plus être déplacée.',
    );
    expect(() => assertReschedule(running, span('2026-11-03T09:30:00.000Z', '2026-11-03T10:45:00.000Z'), now)).not.toThrow();
    expect(() => assertReschedule(running, span('2026-11-03T09:30:00.000Z', '2026-11-03T09:55:00.000Z'), now)).toThrow(
      'La fin de la séance ne peut pas être dans le passé.',
    );
    const ended = span('2026-11-02T17:00:00.000Z', '2026-11-02T18:00:00.000Z');
    expect(() => assertReschedule(ended, span('2026-11-02T17:00:00.000Z', '2026-11-02T18:30:00.000Z'), now)).toThrow(
      'Cette séance est terminée : ses horaires ne peuvent plus changer.',
    );
  });
});

describe('schedule conflicts (room, coach)', () => {
  const slot = (overrides: Partial<ScheduleSlot> = {}): ScheduleSlot => ({
    id: 's-1',
    title: 'Body Pump',
    room: 'Salle cours collectifs',
    coachId: 'c-1',
    coachName: 'Karim Jaziri',
    startsAt: new Date('2026-11-05T17:00:00.000Z'),
    endsAt: new Date('2026-11-05T18:00:00.000Z'),
    ...overrides,
  });
  const yoga = slot({
    id: 's-2',
    title: 'Yoga',
    coachId: 'c-2',
    coachName: 'Leila Ayari',
    startsAt: new Date('2026-11-05T17:30:00.000Z'),
    endsAt: new Date('2026-11-05T18:30:00.000Z'),
  });

  it('compares room names without case, accents or extra spaces', () => {
    expect(roomKey('  Salle  cours Collectifs ')).toBe('salle cours collectifs');
    expect(roomKey('Préau')).toBe(roomKey('preau'));
    expect(roomKey(null)).toBe('');
  });

  it('finds the overlapping session in the same room', () => {
    expect(findScheduleConflict(slot(), [yoga])).toEqual({ kind: 'room', other: yoga });
    expect(findScheduleConflict(slot({ room: ' salle COURS collectifs' }), [yoga])?.kind).toBe('room');
  });

  it('finds the coach already teaching elsewhere', () => {
    const elsewhere = { ...yoga, room: 'Zone cross-training', coachId: 'c-1', coachName: 'Karim Jaziri' };
    expect(findScheduleConflict(slot(), [elsewhere])).toEqual({ kind: 'coach', other: elsewhere });
  });

  it('accepts back-to-back sessions, other rooms and coaches, and skips the session itself', () => {
    const after = { ...yoga, startsAt: new Date('2026-11-05T18:00:00.000Z'), endsAt: new Date('2026-11-05T19:00:00.000Z') };
    const otherRoom = { ...yoga, room: 'Zone cross-training' };
    expect(findScheduleConflict(slot(), [after, otherRoom, slot()])).toBeNull();
    expect(findScheduleConflict(slot({ room: null, coachId: null }), [yoga])).toBeNull();
    // A new session (no id yet) is compared with everything.
    expect(findScheduleConflict(slot({ id: undefined }), [slot()])?.kind).toBe('room');
  });

  it('names the other session with its day and hours in Tunis time', () => {
    expect(scheduleConflictMessage({ kind: 'room', other: yoga })).toBe(
      'La salle « Salle cours collectifs » est déjà prise par « Yoga » le 05/11/2026 de 18:30 à 19:30.',
    );
    expect(scheduleConflictMessage({ kind: 'coach', other: yoga })).toBe('Leila Ayari anime déjà « Yoga » le 05/11/2026 de 18:30 à 19:30.');
    expect(scheduleConflictMessage({ kind: 'coach', other: { ...yoga, coachName: null } })).toBe(
      'Ce coach anime déjà « Yoga » le 05/11/2026 de 18:30 à 19:30.',
    );
  });
});
