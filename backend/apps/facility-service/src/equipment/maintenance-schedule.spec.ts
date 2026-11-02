import { isMaintenanceDue, nextMaintenanceAt } from './maintenance-schedule';

describe('nextMaintenanceAt', () => {
  it('adds the interval to the last maintenance', () => {
    expect(
      nextMaintenanceAt({ lastMaintenanceAt: '2026-10-15', purchaseDate: '2025-01-10', maintenanceIntervalDays: 90 }),
    ).toBe('2027-01-13');
  });

  it('falls back to the purchase date when never maintained', () => {
    expect(
      nextMaintenanceAt({ lastMaintenanceAt: null, purchaseDate: '2026-01-31', maintenanceIntervalDays: 30 }),
    ).toBe('2026-03-02');
  });

  it('is null without an interval or a reference date', () => {
    expect(nextMaintenanceAt({ lastMaintenanceAt: '2026-10-15', purchaseDate: null, maintenanceIntervalDays: null })).toBeNull();
    expect(nextMaintenanceAt({ lastMaintenanceAt: null, purchaseDate: null, maintenanceIntervalDays: 60 })).toBeNull();
  });
});

describe('isMaintenanceDue', () => {
  it('includes overdue and upcoming dates within the window', () => {
    expect(isMaintenanceDue('2026-10-20', 7, '2026-11-02')).toBe(true);
    expect(isMaintenanceDue('2026-11-09', 7, '2026-11-02')).toBe(true);
    expect(isMaintenanceDue('2026-11-10', 7, '2026-11-02')).toBe(false);
    expect(isMaintenanceDue(null, 7, '2026-11-02')).toBe(false);
  });
});
