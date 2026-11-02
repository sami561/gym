/** Minutes late against the planned shift closest to the clock-in time (null without a shift). */
export function lateMinutes(clockIn: Date, shiftStarts: Date[]): number | null {
  if (!shiftStarts.length) return null;
  const nearest = shiftStarts.reduce((best, start) =>
    Math.abs(start.getTime() - clockIn.getTime()) < Math.abs(best.getTime() - clockIn.getTime()) ? start : best,
  );
  return Math.max(0, Math.round((clockIn.getTime() - nearest.getTime()) / 60_000));
}

export function workedMinutes(clockIn: Date, clockOut: Date): number {
  return Math.max(0, Math.round((clockOut.getTime() - clockIn.getTime()) / 60_000));
}
