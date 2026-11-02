import { SalaryType } from '@app/common';
import {
  computePayroll,
  netAmount,
  overlapDays,
  periodBounds,
  periodEndExclusive,
  previousPeriod,
} from './payroll-rules';

const base = { commissionRate: 0, unpaidLeaveDays: 0, workedMinutes: 0, ptSessions: 0, ptRevenue: 0 };

describe('computePayroll', () => {
  it('pays the full monthly salary without unpaid leave', () => {
    const result = computePayroll({ ...base, salaryType: SalaryType.MONTHLY, baseSalary: 1300 });
    expect(result.baseAmount).toBe(1300);
    expect(result.commissions).toBe(0);
  });

  it('deducts unpaid leave days at baseSalary / 26 per day', () => {
    const result = computePayroll({ ...base, salaryType: SalaryType.MONTHLY, baseSalary: 1300, unpaidLeaveDays: 2 });
    expect(result.baseAmount).toBe(1200);
  });

  it('never goes below zero', () => {
    const result = computePayroll({ ...base, salaryType: SalaryType.MONTHLY, baseSalary: 520, unpaidLeaveDays: 30 });
    expect(result.baseAmount).toBe(0);
  });

  it('pays hourly staff for the worked time', () => {
    const result = computePayroll({ ...base, salaryType: SalaryType.HOURLY, baseSalary: 7.5, workedMinutes: 90 * 60 + 20 });
    expect(result.hoursWorked).toBe(90.33);
    expect(result.baseAmount).toBe(677.5);
  });

  it('pays per personal-training session and adds the commission on PT revenue', () => {
    const result = computePayroll({
      ...base,
      salaryType: SalaryType.PER_SESSION,
      baseSalary: 25,
      commissionRate: 0.1,
      ptSessions: 12,
      ptRevenue: 1440,
    });
    expect(result.baseAmount).toBe(300);
    expect(result.sessions).toBe(12);
    expect(result.commissions).toBe(144);
  });

  it('computes the net amount with bonuses and deductions, rounded to 3 decimals', () => {
    expect(netAmount({ baseAmount: 1000.1234, commissions: 50, bonuses: 100, deductions: 30.0006 })).toBe(1120.123);
  });
});

describe('periods', () => {
  it('returns the bounds of a month, including leap years', () => {
    expect(periodBounds('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(periodBounds('2026-11')).toEqual({ start: '2026-11-01', end: '2026-11-30' });
    expect(periodEndExclusive('2026-12')).toBe('2027-01-01');
  });

  it('defaults to the previous month, across years', () => {
    expect(previousPeriod(new Date(2026, 0, 15))).toBe('2025-12');
    expect(previousPeriod(new Date(2026, 10, 2))).toBe('2026-10');
  });

  it('counts overlapping days inclusively', () => {
    expect(overlapDays('2026-10-28', '2026-11-03', '2026-11-01', '2026-11-30')).toBe(3);
    expect(overlapDays('2026-10-01', '2026-10-05', '2026-11-01', '2026-11-30')).toBe(0);
    expect(overlapDays('2026-11-10', '2026-11-10', '2026-11-01', '2026-11-30')).toBe(1);
  });
});
