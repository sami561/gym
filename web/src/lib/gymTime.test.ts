import { describe, expect, it } from 'vitest';
import { addGymDays, gymClock, gymDay, gymMidnight, gymNoon } from './gymTime';

// Every assertion uses explicit UTC instants: the results hold on a device in any timezone.
describe('the gym clock (Africa/Tunis)', () => {
  it('reads days and hours in Tunis, not on the device', () => {
    expect(gymDay('2026-11-03T22:59:00.000Z')).toBe('2026-11-03');
    expect(gymDay('2026-11-03T23:30:00.000Z')).toBe('2026-11-04'); // 00:30 in Tunis
    expect(gymClock('2026-11-05T17:00:00.000Z')).toBe('18:00');
    expect(gymClock('2026-11-05T23:15:00.000Z')).toBe('00:15');
  });

  it('starts a gym day at midnight in Tunis', () => {
    expect(gymMidnight('2026-11-05').toISOString()).toBe('2026-11-04T23:00:00.000Z');
    expect(gymNoon('2026-11-05').toISOString()).toBe('2026-11-05T11:00:00.000Z');
  });

  it('follows the summer time Tunisia had in 2008', () => {
    expect(gymMidnight('2008-03-30').toISOString()).toBe('2008-03-29T23:00:00.000Z'); // clocks moved at 02:00
    expect(gymMidnight('2008-03-31').toISOString()).toBe('2008-03-30T22:00:00.000Z');
    expect(gymMidnight('2008-10-26').toISOString()).toBe('2008-10-25T22:00:00.000Z');
    expect(gymMidnight('2008-10-27').toISOString()).toBe('2008-10-26T23:00:00.000Z');
    expect(gymClock('2008-07-01T16:00:00.000Z')).toBe('18:00');
  });

  it('counts calendar days across months and years', () => {
    expect(addGymDays('2026-11-28', 7)).toBe('2026-12-05');
    expect(addGymDays('2026-12-29', 6)).toBe('2027-01-04');
    expect(addGymDays('2008-03-29', 1)).toBe('2008-03-30');
  });
});
