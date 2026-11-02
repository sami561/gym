import { SalaryType, addDays, diffDays, monthKey } from '@app/common';
import { round2, round3 } from '../shared/inputs';

/** Tunisian convention: a monthly salary covers 26 working days. */
export const WORKING_DAYS_PER_MONTH = 26;

export interface PayrollInput {
  salaryType: SalaryType;
  /** Monthly salary, hourly rate or rate per session depending on salaryType. */
  baseSalary: number;
  commissionRate: number;
  unpaidLeaveDays: number;
  workedMinutes: number;
  ptSessions: number;
  ptRevenue: number;
}

export interface PayrollComputation {
  baseAmount: number;
  hoursWorked: number;
  sessions: number;
  commissions: number;
}

export function computePayroll(input: PayrollInput): PayrollComputation {
  let base: number;
  switch (input.salaryType) {
    case SalaryType.HOURLY:
      base = (input.workedMinutes / 60) * input.baseSalary;
      break;
    case SalaryType.PER_SESSION:
      base = input.ptSessions * input.baseSalary;
      break;
    case SalaryType.MONTHLY:
    default:
      base = input.baseSalary - input.unpaidLeaveDays * (input.baseSalary / WORKING_DAYS_PER_MONTH);
  }
  return {
    baseAmount: round3(Math.max(0, base)),
    hoursWorked: round2(input.workedMinutes / 60),
    sessions: input.ptSessions,
    commissions: round3(Math.max(0, input.commissionRate * input.ptRevenue)),
  };
}

export function netAmount(parts: { baseAmount: number; commissions: number; bonuses: number; deductions: number }): number {
  return round3(parts.baseAmount + parts.commissions + parts.bonuses - parts.deductions);
}

/** First and last calendar day of a YYYY-MM period. */
export function periodBounds(period: string): { start: string; end: string } {
  const [year, month] = period.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return { start: `${period}-01`, end: `${period}-${String(lastDay).padStart(2, '0')}` };
}

export function previousPeriod(now: Date = new Date()): string {
  return monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

/** Number of days two inclusive date ranges share. */
export function overlapDays(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  return start > end ? 0 : diffDays(start, end) + 1;
}

/** Exclusive upper bound of a period, as a date-only string (first day of next month). */
export function periodEndExclusive(period: string): string {
  return addDays(periodBounds(period).end, 1);
}
