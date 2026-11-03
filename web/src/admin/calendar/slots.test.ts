import { describe, expect, it } from 'vitest';
import {
  atDayMinutes,
  calendarDayDiff,
  classMoveRefusal,
  dragStartMinute,
  layoutLanes,
  minutesOfDay,
  moveSpan,
  nextKeyboardPosition,
  pxToMinutes,
  resizeSpan,
  sameSpan,
  snapToSlot,
  type Box,
} from './slots';

// Tests run in Africa/Tunis (vite.config.ts): UTC+1 today, with summer time in 2005–2008.
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const span = (from: Date, to: Date) => ({ startsAt: from.toISOString(), endsAt: to.toISOString() });
const hhmm = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

describe('15-minute slots', () => {
  it('snaps to the nearest quarter hour, halves going up', () => {
    expect(snapToSlot(18 * 60 + 7)).toBe(18 * 60);
    expect(snapToSlot(18 * 60 + 8)).toBe(18 * 60 + 15);
    expect(snapToSlot(18 * 60 + 7.5)).toBe(18 * 60 + 15);
    expect(snapToSlot(-7)).toBe(0);
    expect(Object.is(snapToSlot(-7), -0)).toBe(false);
  });

  it('turns pointer travel into minutes, reversed on a horizontal axis in RTL', () => {
    expect(pxToMinutes(48, 0.8)).toBe(60);
    expect(pxToMinutes(-24, 0.8, 'x', 'ltr')).toBe(-30);
    expect(pxToMinutes(-24, 0.8, 'x', 'rtl')).toBe(30);
    expect(pxToMinutes(24, 0.8, 'y', 'rtl')).toBe(30); // vertical axes never flip
  });

  it('lands a dragged start on a slot inside the visible hours', () => {
    const start = local(2026, 11, 5, 18, 7); // off-grid start, e.g. typed in the editor
    expect(dragStartMinute(start, 0, 60)).toBe(18 * 60); // dropping in place snaps it
    expect(dragStartMinute(start, 22, 60)).toBe(18 * 60 + 30);
    expect(dragStartMinute(start, -15 * 60, 60, { min: 6 * 60, max: 22 * 60 })).toBe(6 * 60);
    expect(dragStartMinute(start, 10 * 60, 60, { min: 6 * 60, max: 22 * 60 })).toBe(21 * 60);
    expect(dragStartMinute(start, 10 * 60, 50, { min: 6 * 60, max: 22 * 60 })).toBe(21 * 60); // 21:10 floors to 21:00
  });

  it('never pulls a span that already runs past midnight back into the day', () => {
    const night = local(2026, 11, 5, 22); // 22:00 – 06:00 the next day
    const bounds = { min: 6 * 60, max: 24 * 60 };
    expect(dragStartMinute(night, 0, 8 * 60, bounds)).toBe(22 * 60); // picked up and dropped in place
    expect(dragStartMinute(night, 2, 8 * 60, bounds)).toBe(22 * 60); // a 5 px mouse drag
    expect(dragStartMinute(night, 60, 8 * 60, bounds)).toBe(22 * 60); // not later than it already ends
    expect(dragStartMinute(night, -60, 8 * 60, bounds)).toBe(21 * 60); // earlier still works
  });
});

describe('moving a span', () => {
  it('keeps the duration and the wall-clock time on another day', () => {
    const body = span(local(2026, 11, 5, 18), local(2026, 11, 5, 18, 45));
    const moved = moveSpan(body, local(2026, 11, 7), 9 * 60 + 30);
    expect(moved.startsAt.toISOString()).toBe('2026-11-07T08:30:00.000Z'); // 09:30 in Tunis
    expect(moved.endsAt.getTime() - moved.startsAt.getTime()).toBe(45 * 60_000);
    expect(hhmm(moved.endsAt)).toBe('10:15');
  });

  it('keeps 10:00 across the spring-forward night (Tunis, 30 March 2008)', () => {
    const saturday = span(local(2008, 3, 29, 10), local(2008, 3, 29, 11));
    const moved = moveSpan(saturday, local(2008, 3, 30), 10 * 60);
    expect(hhmm(moved.startsAt)).toBe('10:00');
    expect(hhmm(moved.endsAt)).toBe('11:00');
    // The day was 23 hours long: same wall-clock time, not "24 hours later".
    expect(moved.startsAt.getTime() - new Date(saturday.startsAt).getTime()).toBe(23 * 3_600_000);
    expect(moved.startsAt.getTimezoneOffset()).toBe(-120);
  });

  it('keeps 18:00 across the fall-back night (Tunis, 26 October 2008)', () => {
    const saturday = span(local(2008, 10, 25, 18), local(2008, 10, 25, 19, 30));
    const moved = moveSpan(saturday, local(2008, 10, 26), minutesOfDay(new Date(saturday.startsAt)));
    expect(hhmm(moved.startsAt)).toBe('18:00');
    expect(hhmm(moved.endsAt)).toBe('19:30');
    expect(moved.startsAt.getTime() - new Date(saturday.startsAt).getTime()).toBe(25 * 3_600_000);
  });

  it('counts calendar days, not 24-hour blocks', () => {
    expect(calendarDayDiff(local(2008, 3, 29, 23), local(2008, 3, 30, 1))).toBe(1);
    expect(calendarDayDiff(local(2008, 10, 26, 0), local(2008, 10, 27, 0))).toBe(1);
    expect(atDayMinutes(local(2026, 11, 5), 24 * 60).toISOString()).toBe(local(2026, 11, 6).toISOString());
  });

  it('notices a move that changes nothing', () => {
    const body = span(local(2026, 11, 5, 18), local(2026, 11, 5, 19));
    expect(sameSpan(body, moveSpan(body, local(2026, 11, 5), 18 * 60))).toBe(true);
    expect(sameSpan(body, moveSpan(body, local(2026, 11, 5), 18 * 60 + 15))).toBe(false);
  });
});

describe('resizing the end', () => {
  const body = span(local(2026, 11, 5, 18), local(2026, 11, 5, 19));

  it('snaps the new end and keeps the start', () => {
    const longer = resizeSpan(body, 37);
    expect(longer.startsAt.toISOString()).toBe(body.startsAt);
    expect(hhmm(longer.endsAt)).toBe('19:30');
  });

  it('keeps at least one slot and stops at the end of the visible day', () => {
    expect(hhmm(resizeSpan(body, -300).endsAt)).toBe('18:15');
    expect(hhmm(resizeSpan(body, 600, 22 * 60).endsAt)).toBe('22:00');
    expect(resizeSpan(body, 600).endsAt.toISOString()).toBe(local(2026, 11, 6).toISOString()); // midnight at most
  });

  it('reads an end at midnight as the end of the start day', () => {
    const late = span(local(2026, 11, 5, 23), local(2026, 11, 6, 0));
    expect(hhmm(resizeSpan(late, -30).endsAt)).toBe('23:30');
  });

  it('does not cut a span past midnight when its end is picked up, but can shorten it', () => {
    const night = span(local(2026, 11, 5, 22), local(2026, 11, 6, 6));
    expect(resizeSpan(night, 0).endsAt.toISOString()).toBe(night.endsAt);
    expect(resizeSpan(night, 5, 24 * 60).endsAt.toISOString()).toBe(night.endsAt);
    expect(resizeSpan(night, -30).endsAt.toISOString()).toBe(local(2026, 11, 6, 5, 30).toISOString());
  });
});

describe('classes in the past', () => {
  const now = local(2026, 11, 3, 11, 0);

  it('refuses a class that already started', () => {
    const running = span(local(2026, 11, 3, 10, 30), local(2026, 11, 3, 11, 30));
    expect(classMoveRefusal(running, moveSpan(running, local(2026, 11, 4), 10 * 60), now)).toBe('started');
    const exactlyNow = span(now, local(2026, 11, 3, 12));
    expect(classMoveRefusal(exactlyNow, moveSpan(exactlyNow, local(2026, 11, 4), 12 * 60), now)).toBe('started');
  });

  it('refuses a drop before now, even earlier today', () => {
    const later = span(local(2026, 11, 3, 18), local(2026, 11, 3, 19));
    expect(classMoveRefusal(later, moveSpan(later, local(2026, 11, 3), 10 * 60 + 45), now)).toBe('past');
    expect(classMoveRefusal(later, moveSpan(later, local(2026, 11, 2), 18 * 60), now)).toBe('past');
    expect(classMoveRefusal(later, moveSpan(later, local(2026, 11, 3), 11 * 60 + 15), now)).toBeNull();
  });
});

describe('lanes for overlapping sessions', () => {
  it('puts overlapping sessions side by side and lets others use the full width', () => {
    const lanes = layoutLanes([
      { id: 'pump', start: 18 * 60, end: 19 * 60 },
      { id: 'cycling', start: 18 * 60 + 30, end: 19 * 60 + 15 },
      { id: 'stretch', start: 19 * 60, end: 19 * 60 + 50 }, // starts when Pump ends: reuses its lane
      { id: 'hiit', start: 20 * 60, end: 20 * 60 + 30 },
    ]);
    expect(lanes.get('pump')).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get('cycling')).toEqual({ lane: 1, lanes: 2 });
    expect(lanes.get('stretch')).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get('hiit')).toEqual({ lane: 0, lanes: 1 });
  });
});

describe('keyboard moves', () => {
  // Three day columns 100 px wide, side by side; the dragged box sits in the middle one.
  const columns: Box[] = [0, 100, 200].map((left) => ({ left, top: 0, width: 100, height: 600 }));
  const box: Box = { left: 110, top: 240, width: 80, height: 48 };

  it('steps by one slot on a time axis', () => {
    expect(nextKeyboardPosition('ArrowDown', box, columns, { y: 12 })).toEqual({ x: 110, y: 252 });
    expect(nextKeyboardPosition('ArrowUp', box, columns, { y: 12 })).toEqual({ x: 110, y: 228 });
  });

  it('jumps to the next column the arrow points to, keeping the time', () => {
    expect(nextKeyboardPosition('ArrowRight', box, columns, { y: 12 })).toEqual({ x: 210, y: 240 });
    expect(nextKeyboardPosition('ArrowLeft', box, columns, { y: 12 })).toEqual({ x: 10, y: 240 });
    expect(nextKeyboardPosition('ArrowRight', { ...box, left: 210 }, columns, { y: 12 })).toBeNull();
    expect(nextKeyboardPosition('KeyA', box, columns)).toBeNull();
  });

  it('moves between cells of a table in line with the box', () => {
    const cells: Box[] = [];
    for (const top of [0, 60, 120]) for (const left of [0, 100, 200]) cells.push({ left, top, width: 100, height: 60 });
    const chip: Box = { left: 105, top: 65, width: 90, height: 20 };
    expect(nextKeyboardPosition('ArrowDown', chip, cells)).toEqual({ x: 105, y: 140 });
    expect(nextKeyboardPosition('ArrowUp', chip, cells)).toEqual({ x: 105, y: 20 });
    expect(nextKeyboardPosition('ArrowLeft', chip, cells)).toEqual({ x: 5, y: 65 });
  });
});
