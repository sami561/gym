import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { LOCALES } from '@/test/fixtures';
import {
  addDays,
  daysFromToday,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatShortDate,
  formatTime,
  formatWeekday,
  initials,
  isSameDay,
  parseDate,
  startOfDay,
  toDateOnly,
} from './format';

const { fr, en, ar } = LOCALES;
const NON_LATIN_DIGITS = /[٠-٩۰-۹]/;

beforeAll(() => {
  // jest.config.js pins the timezone: Tunis is UTC+1 all year (no daylight saving time).
  expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Africa/Tunis');
});

describe('formatMoney', () => {
  it('shows TND with 3 decimals and the currency label of each language', () => {
    expect(formatMoney(120.5, fr)).toBe('120,500 DT');
    expect(formatMoney(120.5, en)).toBe('120.500 TND');
    expect(formatMoney(120.5, ar)).toBe('120,500 د.ت');
  });

  it('groups thousands the local way (narrow no-break space in French)', () => {
    expect(formatMoney(1234567.891, fr)).toBe('1\u202f234\u202f567,891 DT');
    expect(formatMoney(1234567.891, en)).toBe('1,234,567.891 TND');
    expect(formatMoney(1234567.891, ar)).toBe('1.234.567,891 د.ت');
  });

  it('rounds to the millime', () => {
    expect(formatMoney(0, fr)).toBe('0,000 DT');
    expect(formatMoney(0.0005, en)).toBe('0.001 TND');
    expect(formatMoney(19.9999, en)).toBe('20.000 TND');
    expect(formatMoney(35, ar)).toBe('35,000 د.ت');
  });

  it('keeps Latin digits in Arabic', () => {
    expect(formatMoney(9876.543, ar)).not.toMatch(NON_LATIN_DIGITS);
  });
});

describe('formatDate', () => {
  it('writes the long date in each language', () => {
    expect(formatDate('2026-11-02', fr)).toBe('2 novembre 2026');
    expect(formatDate('2026-11-02', en)).toBe('2 November 2026');
    expect(formatDate('2026-11-02', ar)).toBe('2 نوفمبر 2026');
  });

  it('uses the Tunisian month names in Arabic', () => {
    expect(formatDate('2026-01-01', ar)).toBe('1 جانفي 2026');
    expect(formatDate('2026-07-14', ar)).toBe('14 جويلية 2026');
  });

  it('accepts a Date and custom options', () => {
    const blockedUntil = '2026-11-09T21:00:00.000Z';
    const options = { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' } as const;
    expect(formatDate(blockedUntil, fr, options)).toBe('9 novembre à 22:00');
    expect(formatDate(new Date(2026, 10, 9), en)).toBe('9 November 2026');
  });
});

describe('formatShortDate', () => {
  it('writes day and abbreviated month', () => {
    expect(formatShortDate('2026-11-02', fr)).toBe('2 nov.');
    expect(formatShortDate('2026-11-02', en)).toBe('2 Nov');
    expect(formatShortDate('2026-06-15', ar)).toBe('15 جوان');
  });
});

describe('formatTime', () => {
  it('shows the time in Tunis (UTC+1)', () => {
    expect(formatTime('2026-11-02T17:30:00.000Z', fr)).toBe('18:30');
    expect(formatTime('2026-11-02T17:30:00.000Z', en)).toBe('18:30');
    expect(formatTime(new Date('2026-07-02T08:05:00.000Z'), fr)).toBe('09:05');
  });

  it('uses the 12-hour clock with ص/م in Arabic, with Latin digits', () => {
    expect(formatTime('2026-11-02T17:30:00.000Z', ar)).toBe('06:30 م');
    expect(formatTime('2026-11-02T08:05:00.000Z', ar)).toBe('09:05 ص');
  });
});

describe('formatDateTime', () => {
  it('combines the short date and the time', () => {
    expect(formatDateTime('2026-11-02T17:30:00.000Z', fr)).toBe('2 nov., 18:30');
    expect(formatDateTime('2026-11-02T17:30:00.000Z', en)).toBe('2 Nov, 18:30');
    expect(formatDateTime('2026-11-02T17:30:00.000Z', ar)).toBe('2 نوفمبر، 06:30 م');
  });

  it('moves to the next day when it is already past midnight in Tunis', () => {
    expect(formatDateTime('2026-11-02T23:15:00.000Z', en)).toBe('3 Nov, 00:15');
  });
});

describe('formatWeekday', () => {
  it('gives the short weekday without the abbreviation dot', () => {
    expect(formatWeekday(new Date(2026, 10, 2), fr)).toBe('lun');
    expect(formatWeekday(new Date(2026, 10, 5), fr)).toBe('jeu');
    expect(formatWeekday(new Date(2026, 10, 2), en)).toBe('Mon');
    expect(formatWeekday(new Date(2026, 10, 2), ar)).toBe('الاثنين');
  });
});

describe('formatNumber', () => {
  it('keeps one decimal by default and drops trailing zeros', () => {
    expect(formatNumber(72.45, fr)).toBe('72,5');
    expect(formatNumber(72.45, en)).toBe('72.5');
    expect(formatNumber(72.45, ar)).toBe('72,5');
    expect(formatNumber(70, fr)).toBe('70');
  });

  it('honours the number of digits', () => {
    expect(formatNumber(72.46, en, 0)).toBe('72');
    expect(formatNumber(1.23456, en, 3)).toBe('1.235');
  });

  it('groups thousands', () => {
    expect(formatNumber(1234.56, fr)).toBe('1\u202f234,6');
    expect(formatNumber(1234.56, ar)).toBe('1.234,6');
  });
});

describe('initials', () => {
  it('takes the first letter of each name in upper case', () => {
    expect(initials('sami', 'ben ali')).toBe('SB');
    expect(initials('Élodie', 'durand')).toBe('ÉD');
    expect(initials('سامي', 'بن علي')).toBe('سب');
  });

  it('works with a single name', () => {
    expect(initials('Sami', null)).toBe('S');
    expect(initials(undefined, 'Trabelsi')).toBe('T');
  });

  it('falls back to M (Meliora) without any name', () => {
    expect(initials()).toBe('M');
    expect(initials(null, null)).toBe('M');
    expect(initials('', '')).toBe('M');
  });
});

describe('parseDate', () => {
  it('reads YYYY-MM-DD as local midnight of that day, not UTC midnight', () => {
    const date = parseDate('2026-03-01');
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2026, 2, 1, 0]);
    expect(date.toISOString()).toBe('2026-02-28T23:00:00.000Z');
  });

  it('reads timestamps as instants', () => {
    expect(parseDate('2026-11-02T17:30:00.000Z').getTime()).toBe(Date.UTC(2026, 10, 2, 17, 30));
  });

  it('round-trips with toDateOnly', () => {
    for (const day of ['2026-01-01', '2026-02-28', '2028-02-29', '2026-12-31']) {
      expect(toDateOnly(parseDate(day))).toBe(day);
    }
  });
});

describe('toDateOnly', () => {
  it('gives the calendar day in Tunis, zero-padded', () => {
    expect(toDateOnly(new Date('2026-11-02T22:59:59.000Z'))).toBe('2026-11-02');
    expect(toDateOnly(new Date('2026-11-02T23:00:00.000Z'))).toBe('2026-11-03');
    expect(toDateOnly(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('day arithmetic', () => {
  it('startOfDay returns local midnight without touching its argument', () => {
    const late = new Date('2026-11-02T22:30:00.000Z'); // 23:30 in Tunis
    expect(startOfDay(late).toISOString()).toBe('2026-11-01T23:00:00.000Z');
    expect(late.toISOString()).toBe('2026-11-02T22:30:00.000Z');
  });

  it('addDays crosses month and year ends, backwards too, without mutating', () => {
    const newYearsEve = new Date(2026, 11, 31, 18, 0);
    expect(toDateOnly(addDays(newYearsEve, 1))).toBe('2027-01-01');
    expect(addDays(newYearsEve, 1).getHours()).toBe(18);
    expect(toDateOnly(addDays(new Date(2026, 2, 1), -1))).toBe('2026-02-28');
    expect(toDateOnly(addDays(new Date(2028, 1, 28), 1))).toBe('2028-02-29');
    expect(toDateOnly(newYearsEve)).toBe('2026-12-31');
  });

  it('isSameDay compares local calendar days', () => {
    expect(isSameDay(new Date(2026, 10, 2, 0, 0), new Date(2026, 10, 2, 23, 59))).toBe(true);
    // 23:30 UTC is already 3 Nov in Tunis.
    expect(isSameDay(new Date('2026-11-02T23:30:00.000Z'), new Date('2026-11-02T12:00:00.000Z'))).toBe(false);
    expect(isSameDay(new Date(2026, 10, 2), new Date(2027, 10, 2))).toBe(false);
  });
});

describe('daysFromToday', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts whole calendar days from today', () => {
    jest.useFakeTimers({ now: new Date('2026-11-02T22:30:00.000Z') }); // 23:30 in Tunis, still the 2nd
    expect(daysFromToday('2026-11-02')).toBe(0);
    expect(daysFromToday('2026-11-03')).toBe(1);
    expect(daysFromToday('2026-11-01')).toBe(-1);
    expect(daysFromToday('2026-12-25')).toBe(53);
    expect(daysFromToday('2027-11-02')).toBe(365);
  });

  it('places a timestamp on its day in Tunis', () => {
    jest.useFakeTimers({ now: new Date('2026-11-02T10:00:00.000Z') });
    expect(daysFromToday('2026-11-03T23:30:00.000Z')).toBe(2); // 4 Nov, 00:30 in Tunis
  });
});
