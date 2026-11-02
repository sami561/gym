import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  currencySymbol,
  currentLocale,
  formatCompact,
  formatDate,
  formatDateTime,
  formatInt,
  formatNumber,
  formatPercent,
  formatTime,
  formatTND,
  formatTNDShort,
  formatWeekday,
  fullName,
  hourLabel,
  initials,
  isoDay,
  monthLabel,
  relativeTime,
  setFormatLocale,
  startOfWeek,
  toDate,
} from './format';

/** Text as read on screen: invisible bidi marks dropped, no-break spaces shown as plain spaces. */
function plain(text: string): string {
  return text.replace(/\p{Cf}/gu, '').replace(/\s/g, ' ');
}

const NON_LATIN_DIGIT = /(?![0-9])\p{Nd}/u;
const NOW = new Date('2026-03-10T12:00:00Z'); // Tuesday, 13:00 in Tunis

afterEach(() => {
  setFormatLocale('fr');
  vi.useRealTimers();
});

describe('formatTND', () => {
  it.each([
    ['fr', '120,500 DT'],
    ['en', '120.500 DT'],
    ['ar', '120,500 د.ت'],
  ] as const)('shows dinars with three decimals in %s', (lang, expected) => {
    setFormatLocale(lang);
    expect(formatTND(120.5)).toBe(expected);
  });

  it.each([
    ['fr', '1 234 567,891 DT'],
    ['en', '1,234,567.891 DT'],
    ['ar', '1.234.567,891 د.ت'],
  ] as const)('groups thousands in %s', (lang, expected) => {
    setFormatLocale(lang);
    expect(plain(formatTND(1234567.891))).toBe(expected);
  });

  it('keeps the thousands of an amount together with a no-break space in French', () => {
    expect(formatTND(1234.5)).toMatch(/^1(?! )\s234,500 DT$/);
  });

  it('rounds to the millime', () => {
    expect(formatTND(12.3456)).toBe('12,346 DT');
    expect(formatTND(12.3454)).toBe('12,345 DT');
  });

  it('reads zero, null and undefined as 0', () => {
    expect(formatTND(0)).toBe('0,000 DT');
    expect(formatTND(null)).toBe('0,000 DT');
    expect(formatTND(undefined)).toBe('0,000 DT');
  });

  it.each([
    ['fr', '-45,250 DT'],
    ['en', '-45.250 DT'],
    ['ar', '-45,250 د.ت'],
  ] as const)('shows refunds and losses with a minus sign in %s', (lang, expected) => {
    setFormatLocale(lang);
    expect(plain(formatTND(-45.25))).toBe(expected);
  });

  it('never shows "-0,000 DT" for an amount that rounds to zero', () => {
    // A shop margin from float prices: 0.3 - (0.1 + 0.2) = -5.6e-17
    expect(formatTND(0.3 - (0.1 + 0.2))).toBe('0,000 DT');
    expect(formatTND(-0.0004)).toBe('0,000 DT');
    expect(formatTND(-0)).toBe('0,000 DT');
  });
});

describe('formatTNDShort', () => {
  it.each([
    ['fr', '1 251 DT'],
    ['en', '1,251 DT'],
    ['ar', '1.251 د.ت'],
  ] as const)('drops the millimes for stat tiles in %s', (lang, expected) => {
    setFormatLocale(lang);
    expect(plain(formatTNDShort(1250.75))).toBe(expected);
  });

  it('shows 0 DT for missing values and amounts that round to zero', () => {
    expect(formatTNDShort(null)).toBe('0 DT');
    expect(formatTNDShort(-0.4)).toBe('0 DT');
  });
});

describe('currencySymbol and currentLocale', () => {
  it.each([
    ['fr', 'DT', 'fr-FR'],
    ['en', 'DT', 'en-GB'],
    ['ar', 'د.ت', 'ar-TN'],
  ] as const)('follow the UI language (%s)', (lang, symbol, locale) => {
    setFormatLocale(lang);
    expect(currencySymbol()).toBe(symbol);
    expect(currentLocale()).toBe(locale);
  });
});

describe('numbers', () => {
  it('formatCompact keeps small axis ticks whole and shortens thousands', () => {
    expect([0, 950, 1200, 12000, -1500].map((value) => plain(formatCompact(value)))).toEqual(['0', '950', '1,2 k', '12 k', '-1,5 k']);
    setFormatLocale('en');
    // CLDR 48 (ICU 78) writes "1.2k" where older data wrote "1.2K".
    expect([950, 1200, 12000].map((value) => formatCompact(value).toLowerCase())).toEqual(['950', '1.2k', '12k']);
  });

  it('formatInt groups thousands and reads a missing count as 0', () => {
    expect(plain(formatInt(12345))).toBe('12 345');
    expect(formatInt(undefined)).toBe('0');
    setFormatLocale('en');
    expect(formatInt(12345)).toBe('12,345');
  });

  it('formatNumber limits the decimals', () => {
    expect(formatNumber(12.367)).toBe('12,4');
    expect(formatNumber(12.367, 2)).toBe('12,37');
    expect(formatNumber(80)).toBe('80');
  });

  it('formatPercent turns ratios into percentages', () => {
    expect(plain(formatPercent(0.256))).toBe('26 %');
    expect(plain(formatPercent(0.1234, 1))).toBe('12,3 %');
    setFormatLocale('en');
    expect(formatPercent(0.256)).toBe('26%');
  });

  it('shows a flat change as "0 %", not "-0 %" (dashboard revenue trend)', () => {
    expect(plain(formatPercent(-0.004))).toBe('0 %');
    expect(formatInt(-0)).toBe('0');
    expect(formatNumber(-0.04)).toBe('0');
  });

  it('still loads in browsers that reject signDisplay "negative" (Firefox ESR 115, Safari < 15.4)', async () => {
    const NumberFormat = Intl.NumberFormat;
    vi.spyOn(Intl, 'NumberFormat').mockImplementation(function (locales?: string | string[], options?: Intl.NumberFormatOptions) {
      if (options?.signDisplay === 'negative') throw new RangeError('Value negative out of range for Intl.NumberFormat options property signDisplay');
      return new NumberFormat(locales, options);
    } as unknown as typeof Intl.NumberFormat);
    // format.ts builds its formatters on import: load a fresh copy under the older engine.
    vi.resetModules();
    const legacy = await import('./format');
    expect(legacy.formatTND(120.5)).toBe('120,500 DT');
    expect(plain(legacy.formatTND(-45.25))).toBe('-45,250 DT');
    expect(plain(legacy.formatPercent(0.256))).toBe('26 %');
    expect(plain(legacy.formatInt(12345))).toBe('12 345');
  });
});

describe('toDate', () => {
  it('reads YYYY-MM-DD as that calendar day from local midnight, not as UTC midnight', () => {
    const day = toDate('2026-03-10');
    expect([day.getFullYear(), day.getMonth(), day.getDate(), day.getHours(), day.getMinutes()]).toEqual([2026, 2, 10, 0, 0]);
  });

  it('reads ISO date-times as instants, on the Tunis clock (UTC+1)', () => {
    const late = toDate('2026-03-10T23:30:00.000Z');
    expect([late.getDate(), late.getHours(), late.getMinutes()]).toEqual([11, 0, 30]);
  });

  it('returns Date objects unchanged', () => {
    const date = new Date(2026, 2, 10);
    expect(toDate(date)).toBe(date);
  });
});

describe('formatDate', () => {
  it.each([
    ['fr', '10 mars 2026'],
    ['en', '10 Mar 2026'],
    ['ar', '10 مارس 2026'],
  ] as const)('shows day, short month and year in %s', (lang, expected) => {
    setFormatLocale(lang);
    expect(formatDate('2026-03-10')).toBe(expected);
  });

  it('shows a dash for a missing date', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
  });

  it('keeps date-only values on their day and puts instants on the Tunis day', () => {
    expect(formatDate('2026-03-01')).toBe('1 mars 2026');
    expect(formatDate('2026-03-10T23:30:00Z')).toBe('11 mars 2026');
  });

  it('accepts custom options', () => {
    expect(formatDate('2026-03-10', { weekday: 'long', day: 'numeric', month: 'long' })).toBe('mardi 10 mars');
  });

  it('uses the Tunisian month names in Arabic', () => {
    setFormatLocale('ar');
    expect(formatDate('2026-01-05')).toBe('5 جانفي 2026');
  });
});

describe('formatDateTime', () => {
  it.each([
    ['fr', /^10 mars\D+18:05$/],
    ['en', /^10 Mar\D+18:05$/],
    ['ar', /^10 مارس\D+18:05$/],
  ] as const)('shows the Tunis wall-clock time on a 24 h clock in %s', (lang, expected) => {
    setFormatLocale(lang);
    expect(formatDateTime('2026-03-10T17:05:00Z')).toMatch(expected);
  });

  it('shows a dash for a missing date', () => {
    expect(formatDateTime(null)).toBe('—');
  });
});

describe('formatTime', () => {
  it('prints HH:MM on the Tunis clock whatever the language', () => {
    for (const lang of ['fr', 'en', 'ar'] as const) {
      setFormatLocale(lang);
      expect(formatTime('2026-03-10T17:05:00Z')).toBe('18:05');
    }
  });

  it('pads hours and minutes, as <input type="time"> expects', () => {
    expect(formatTime(new Date(2026, 2, 10, 9, 3))).toBe('09:03');
    expect(formatTime('2026-03-10')).toBe('00:00');
  });
});

describe('formatWeekday', () => {
  it.each([
    ['fr', 'Mardi', 'Mar.'],
    ['en', 'Tuesday', 'Tue'],
    ['ar', 'الثلاثاء', 'الثلاثاء'],
  ] as const)('names the day, capitalised, in %s', (lang, long, short) => {
    setFormatLocale(lang);
    expect(formatWeekday('2026-03-10')).toBe(long);
    expect(formatWeekday('2026-03-10', 'short')).toBe(short);
  });

  it('uses the Tunis day for instants', () => {
    // Sunday 23:30 UTC is already Monday in Tunis.
    expect(formatWeekday('2026-03-15T23:30:00Z')).toBe('Lundi');
  });
});

describe('relativeTime', () => {
  const at = (secondsFromNow: number) => new Date(NOW.getTime() + secondsFromNow * 1000).toISOString();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  it.each([
    ['fr', ['maintenant', 'il y a 5 minutes', 'dans 5 minutes', 'il y a 3 heures', 'hier', 'demain']],
    ['en', ['now', '5 minutes ago', 'in 5 minutes', '3 hours ago', 'yesterday', 'tomorrow']],
    ['ar', ['الآن', 'قبل 5 دقائق', 'خلال 5 دقائق', 'قبل 3 ساعات', 'أمس', 'غدًا']],
  ] as const)('reads naturally in %s', (lang, expected) => {
    setFormatLocale(lang);
    const moments = [at(-10), at(-5 * 60), at(5 * 60), at(-3 * 3600), at(-26 * 3600), at(26 * 3600)];
    expect(moments.map(relativeTime)).toEqual(expected);
  });

  it('says "now" under 45 seconds, then counts minutes', () => {
    expect(relativeTime(at(-44))).toBe('maintenant');
    expect(relativeTime(at(-45))).toBe('il y a 1 minute');
  });

  it('counts days for a week, then shows the date and time', () => {
    expect(relativeTime(at(-3 * 86400))).toBe('il y a 3 jours');
    expect(relativeTime(at(-8 * 86400))).toBe(formatDateTime(at(-8 * 86400)));
  });

  // Known quirk, see the report: the unit is chosen before rounding.
  it.todo('says "il y a 1 heure" rather than "il y a 60 minutes" from 59 min 30 s');
});

describe('hourLabel', () => {
  it('labels chart hours on a 24 h clock', () => {
    expect(hourLabel(18)).toBe('18h');
    setFormatLocale('en');
    expect(hourLabel(6)).toBe('6h');
    setFormatLocale('ar');
    expect(hourLabel(18)).toBe('18:00');
  });
});

describe('calendar helpers', () => {
  it('isoDay gives the local calendar day, not the UTC one', () => {
    expect(isoDay(new Date('2026-03-10T23:30:00Z'))).toBe('2026-03-11');
    expect(isoDay(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('addDays crosses month and year ends, keeps the time and leaves the input alone', () => {
    const newYearsEve = new Date(2026, 11, 31, 18, 30);
    const next = addDays(newYearsEve, 1);
    expect([isoDay(next), next.getHours(), next.getMinutes()]).toEqual(['2027-01-01', 18, 30]);
    expect(isoDay(addDays(new Date(2026, 2, 1), -1))).toBe('2026-02-28');
    expect(isoDay(newYearsEve)).toBe('2026-12-31');
  });

  it('startOfWeek returns Monday 00:00, Sunday belonging to the week before', () => {
    const monday = new Date(2026, 2, 9);
    expect(startOfWeek(new Date(2026, 2, 11, 15, 0))).toEqual(monday);
    expect(startOfWeek(new Date(2026, 2, 15, 23, 59))).toEqual(monday);
    expect(startOfWeek(monday)).toEqual(monday);
    expect(startOfWeek(new Date(2026, 2, 1))).toEqual(new Date(2026, 1, 23));
  });
});

describe('monthLabel', () => {
  it.each([
    ['fr', 'mars', 'mars 26'],
    ['en', 'Mar', 'Mar 26'],
    ['ar', 'مارس', 'مارس 26'],
  ] as const)('names the month of a YYYY-MM key in %s', (lang, short, withYear) => {
    setFormatLocale(lang);
    expect(monthLabel('2026-03')).toBe(short);
    expect(monthLabel('2026-03', true)).toBe(withYear);
  });

  it('drops the abbreviation dot', () => {
    expect(monthLabel('2026-01')).toBe('janv');
    expect(monthLabel('2026-02', true)).toBe('févr 26');
  });
});

describe('names', () => {
  it('fullName leaves no stray space when a part is empty', () => {
    expect(fullName({ firstName: 'Amira', lastName: 'Ben Salah' })).toBe('Amira Ben Salah');
    expect(fullName({ firstName: 'Amira', lastName: '' })).toBe('Amira');
  });

  it('initials takes the first letter of the first two words', () => {
    expect(initials('amira ben salah')).toBe('AB');
    expect(initials('  Youssef  ')).toBe('Y');
    expect(initials('')).toBe('');
    expect(initials('أمين التونسي')).toBe('أا');
  });
});

describe('Arabic output', () => {
  it('uses Latin digits in every formatter', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    setFormatLocale('ar');
    const outputs = [
      formatTND(1234.5),
      formatTNDShort(1234.5),
      formatCompact(12345),
      formatInt(12345),
      formatNumber(12.5),
      formatPercent(0.25),
      formatDate('2026-03-10'),
      formatDateTime('2026-03-10T17:05:00Z'),
      relativeTime('2026-03-10T11:55:00Z'),
      monthLabel('2026-03', true),
      hourLabel(18),
    ];
    for (const text of outputs) {
      expect(text).toMatch(/[0-9]/);
      expect(text).not.toMatch(NON_LATIN_DIGIT);
    }
  });
});
