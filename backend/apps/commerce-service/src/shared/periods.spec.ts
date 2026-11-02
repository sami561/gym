import { BadRequestException } from '@nestjs/common';
import {
  assertDateOnly,
  clampInt,
  gymTimezone,
  likePattern,
  monthKeysBack,
  monthKeysBetween,
  parseFrom,
  parseToExclusive,
  toDateBound,
} from './periods';

// Gym days are Africa/Tunis days (UTC+1): local midnight is 23:00 UTC the day before.
describe('report periods (commerce)', () => {
  it('uses the process timezone, Africa/Tunis by default', () => {
    expect(gymTimezone()).toBe(process.env.TZ || 'Africa/Tunis');
  });

  describe('parseFrom / parseToExclusive', () => {
    it('reads a day as the start of that gym day', () => {
      expect(parseFrom('2026-11-01')?.toISOString()).toBe('2026-10-31T23:00:00.000Z');
    });

    it('makes the upper day inclusive by stopping at the next local midnight', () => {
      expect(parseToExclusive('2026-11-30')?.toISOString()).toBe('2026-11-30T23:00:00.000Z');
      expect(parseToExclusive('2026-12-31')?.toISOString()).toBe('2026-12-31T23:00:00.000Z');
    });

    it('keeps ISO date-times as exact instants', () => {
      expect(parseFrom('2026-11-02T08:30:00.000Z')?.toISOString()).toBe('2026-11-02T08:30:00.000Z');
      expect(parseToExclusive('2026-11-02T08:30:00.000Z')?.toISOString()).toBe('2026-11-02T08:30:00.000Z');
    });

    it('treats missing bounds as open', () => {
      expect(parseFrom(undefined)).toBeUndefined();
      expect(parseFrom('')).toBeUndefined();
      expect(parseToExclusive(null)).toBeUndefined();
    });

    it('refuses unreadable dates in French, naming the bound', () => {
      expect(() => parseFrom('hier')).toThrow(new BadRequestException('Date invalide pour « du ».'));
      expect(() => parseToExclusive('31/12/2026')).toThrow('Date invalide pour « au ».');
    });
  });

  describe('toDateBound / assertDateOnly', () => {
    it('keeps the date part of a day or a date-time', () => {
      expect(toDateBound('2026-11-02')).toBe('2026-11-02');
      expect(toDateBound('2026-11-02T23:59:59.000Z')).toBe('2026-11-02');
      expect(toDateBound(undefined)).toBeUndefined();
    });

    it('refuses anything else', () => {
      expect(() => toDateBound('02/11/2026')).toThrow('Date invalide : 02/11/2026.');
    });

    it('accepts only YYYY-MM-DD strings, with a French message naming the field', () => {
      expect(assertDateOnly('2026-11-02', 'La date de début')).toBe('2026-11-02');
      for (const value of ['2026-11-2', '2026/11/02', '', 20261102, null, undefined]) {
        expect(() => assertDateOnly(value, 'La date de début')).toThrow(
          new BadRequestException('La date de début doit être une date au format AAAA-MM-JJ.'),
        );
      }
    });
  });

  describe('month keys', () => {
    it('lists the last N months, oldest first, across the new year', () => {
      expect(monthKeysBack(12, new Date(2026, 10, 2))).toEqual([
        '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05',
        '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11',
      ]);
    });

    it('lists the months of a date range, both ends included', () => {
      expect(monthKeysBetween('2026-11-30', '2026-12-01')).toEqual(['2026-11', '2026-12']);
      expect(monthKeysBetween('2026-01-31', '2026-03-01')).toEqual(['2026-01', '2026-02', '2026-03']);
      expect(monthKeysBetween('2026-12-01', '2026-11-30')).toEqual([]);
    });
  });

  describe('clampInt', () => {
    it('truncates and clamps, with a fallback for non-numbers', () => {
      expect(clampInt('12', 20, 1, 100)).toBe(12);
      expect(clampInt(7.9, 20, 1, 100)).toBe(7);
      expect(clampInt(0, 20, 1, 100)).toBe(1);
      expect(clampInt(10_000, 20, 1, 100)).toBe(100);
      expect(clampInt('abc', 20, 1, 100)).toBe(20);
      expect(clampInt(undefined, 20, 1, 100)).toBe(20);
    });
  });

  describe('likePattern', () => {
    it('wraps the trimmed search and escapes LIKE wildcards', () => {
      expect(likePattern('  whey ')).toBe('%whey%');
      expect(likePattern('100%_pur\\')).toBe('%100\\%\\_pur\\\\%');
    });
  });
});
