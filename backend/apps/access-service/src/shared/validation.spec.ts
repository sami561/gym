import { clampInt, gymTimezone, isDateOnly, isUuid } from './validation';

describe('access-service input helpers', () => {
  it('recognises uuids, any case', () => {
    expect(isUuid('6c1f3a52-9b7e-4d21-8f3a-0e5b7c9d1a24')).toBe(true);
    expect(isUuid('6C1F3A52-9B7E-4D21-8F3A-0E5B7C9D1A24')).toBe(true);
    expect(isUuid('6c1f3a52-9b7e-4d21-8f3a-0e5b7c9d1a2')).toBe(false);
    expect(isUuid(' 6c1f3a52-9b7e-4d21-8f3a-0e5b7c9d1a24')).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(42)).toBe(false);
  });

  it('recognises YYYY-MM-DD strings', () => {
    expect(isDateOnly('2026-11-02')).toBe(true);
    expect(isDateOnly('2026-11-02T10:00:00Z')).toBe(false);
    expect(isDateOnly('02/11/2026')).toBe(false);
    expect(isDateOnly(20261102)).toBe(false);
  });

  it('clamps and truncates integers with a fallback', () => {
    expect(clampInt('25', 1, 200, 50)).toBe(25);
    expect(clampInt(7.9, 1, 200, 50)).toBe(7);
    expect(clampInt(-4, 1, 200, 50)).toBe(1);
    expect(clampInt(10_000, 1, 200, 50)).toBe(200);
    expect(clampInt('beaucoup', 1, 200, 50)).toBe(50);
  });

  it('groups statistics by gym day in Africa/Tunis by default', () => {
    expect(gymTimezone()).toBe(process.env.TZ || 'Africa/Tunis');
  });
});
