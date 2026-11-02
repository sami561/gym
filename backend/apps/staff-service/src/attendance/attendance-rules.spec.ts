import { lateMinutes, workedMinutes } from './attendance-rules';

const at = (time: string) => new Date(`2026-11-02T${time}:00+01:00`);

describe('lateMinutes', () => {
  it('is null when no shift is planned that day', () => {
    expect(lateMinutes(at('08:10'), [])).toBeNull();
  });

  it('counts the minutes after the shift start', () => {
    expect(lateMinutes(at('08:12'), [at('08:00')])).toBe(12);
  });

  it('is zero when clocking in early', () => {
    expect(lateMinutes(at('07:50'), [at('08:00')])).toBe(0);
  });

  it('uses the shift closest to the clock-in time', () => {
    expect(lateMinutes(at('17:55'), [at('06:00'), at('18:00')])).toBe(0);
    expect(lateMinutes(at('18:20'), [at('06:00'), at('18:00')])).toBe(20);
  });
});

describe('workedMinutes', () => {
  it('rounds to the minute and never goes negative', () => {
    expect(workedMinutes(at('08:00'), at('16:30'))).toBe(510);
    expect(workedMinutes(at('08:00'), at('07:00'))).toBe(0);
  });
});
