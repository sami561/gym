import {
  DateWindow,
  addDays,
  addMonths,
  diffDays,
  isWithinWindows,
  lastCoveredDay,
  monthKey,
  parseDateOnly,
  startOfDay,
  startOfMonth,
  toDateOnly,
} from './dates';

// Gym days are calendar days in Africa/Tunis: jest runs with TZ=Africa/Tunis (CI env, loadEnv default).
describe('calendar helpers (gym days in Africa/Tunis)', () => {
  it('runs in the gym timezone (UTC+1 all year, no daylight saving)', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(-60);
    expect(new Date(2026, 6, 15).getTimezoneOffset()).toBe(-60);
  });

  describe('toDateOnly / parseDateOnly', () => {
    it('formats the local calendar day with zero padding', () => {
      expect(toDateOnly(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    });

    it('uses the gym day, not the UTC day, around midnight', () => {
      expect(toDateOnly(new Date('2026-11-02T22:59:59.999Z'))).toBe('2026-11-02');
      // 23:30 UTC is already 00:30 the next day in Tunis.
      expect(toDateOnly(new Date('2026-11-02T23:30:00.000Z'))).toBe('2026-11-03');
    });

    it('parses a day to its local midnight and ignores a time part', () => {
      expect(parseDateOnly('2026-11-02').toISOString()).toBe('2026-11-01T23:00:00.000Z');
      expect(parseDateOnly('2026-11-02T15:00:00.000Z')).toEqual(parseDateOnly('2026-11-02'));
    });

    it('round-trips every day of a leap year', () => {
      let day = '2028-01-01';
      for (let i = 0; i < 366; i += 1) {
        expect(toDateOnly(parseDateOnly(day))).toBe(day);
        day = addDays(day, 1);
      }
      expect(day).toBe('2029-01-01');
    });
  });

  describe('addDays', () => {
    it('crosses month and year ends', () => {
      expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
      expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
      expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    });

    it('knows leap years', () => {
      expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
      expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    });

    it('gives the inclusive end of a 30-day plan (start + 29)', () => {
      expect(addDays('2026-11-02', 29)).toBe('2026-12-01');
    });
  });

  describe('diffDays', () => {
    it('counts whole days, negative when the end is earlier', () => {
      expect(diffDays('2026-11-02', '2026-11-08')).toBe(6);
      expect(diffDays('2026-11-08', '2026-11-02')).toBe(-6);
      expect(diffDays('2026-11-02', '2026-11-02')).toBe(0);
    });

    it('crosses February and the new year', () => {
      expect(diffDays('2028-02-01', '2028-03-01')).toBe(29);
      expect(diffDays('2026-12-25', '2027-01-05')).toBe(11);
    });
  });

  describe('month helpers', () => {
    it('starts the day and the month at local midnight', () => {
      const at = new Date(2026, 10, 2, 18, 45, 12);
      expect(startOfDay(at)).toEqual(new Date(2026, 10, 2));
      expect(startOfMonth(at)).toEqual(new Date(2026, 10, 1));
    });

    it('moves by whole months to the 1st, even from the 31st', () => {
      expect(addMonths(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 1));
      expect(addMonths(new Date(2026, 0, 15), -1)).toEqual(new Date(2025, 11, 1));
      expect(addMonths(new Date(2026, 10, 1), 14)).toEqual(new Date(2028, 0, 1));
    });

    it('keys months as YYYY-MM', () => {
      expect(monthKey(new Date(2026, 0, 31))).toBe('2026-01');
      expect(monthKey(new Date(2026, 11, 1))).toBe('2026-12');
    });
  });

  describe('isWithinWindows', () => {
    const windows: DateWindow[] = [
      { from: '2026-10-01', until: '2026-10-31' },
      { from: '2026-12-01', until: '2026-12-31' },
    ];

    it('includes the first and last day of each window', () => {
      expect(isWithinWindows(windows, '2026-10-01')).toBe(true);
      expect(isWithinWindows(windows, '2026-10-31')).toBe(true);
      expect(isWithinWindows(windows, '2026-12-15')).toBe(true);
    });

    it('excludes the days between and around windows', () => {
      expect(isWithinWindows(windows, '2026-09-30')).toBe(false);
      expect(isWithinWindows(windows, '2026-11-15')).toBe(false);
      expect(isWithinWindows([], '2026-11-15')).toBe(false);
    });
  });

  describe('lastCoveredDay (uninterrupted access)', () => {
    it('is the end of the window covering the day', () => {
      expect(lastCoveredDay([{ from: '2026-10-10', until: '2026-11-08' }], '2026-11-02')).toBe('2026-11-08');
    });

    it('is null when no window covers the day, even with a future one', () => {
      expect(lastCoveredDay([{ from: '2026-11-10', until: '2026-12-09' }], '2026-11-02')).toBeNull();
      expect(lastCoveredDay([], '2026-11-02')).toBeNull();
    });

    it('chains renewals starting the next day, whatever the input order', () => {
      const windows = [
        { from: '2026-12-09', until: '2027-01-07' },
        { from: '2026-10-10', until: '2026-11-08' },
        { from: '2026-11-09', until: '2026-12-08' },
      ];
      expect(lastCoveredDay(windows, '2026-11-02')).toBe('2027-01-07');
    });

    it('stops at a gap of one day', () => {
      const windows = [
        { from: '2026-10-10', until: '2026-11-08' },
        { from: '2026-11-10', until: '2026-12-09' },
      ];
      expect(lastCoveredDay(windows, '2026-11-02')).toBe('2026-11-08');
    });

    it('follows an overlapping renewal and ignores a window inside the current one', () => {
      const windows = [
        { from: '2026-10-01', until: '2026-10-25' },
        { from: '2026-10-05', until: '2026-10-12' },
        { from: '2026-10-20', until: '2026-11-30' },
      ];
      expect(lastCoveredDay(windows, '2026-10-08')).toBe('2026-11-30');
    });
  });
});
