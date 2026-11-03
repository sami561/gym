/**
 * Drag and drop on the back-office calendars (class planning, team calendar): pure date and slot
 * arithmetic. Times are wall-clock times of the browser, which is the gym's (Africa/Tunis), like the
 * rest of the back office. Days and minutes are built from calendar fields (never by adding 24 h), so a
 * move keeps its wall-clock time across a DST change; durations are kept in real minutes.
 */

export const SLOT_MINUTES = 15;
export const DAY_MINUTES = 24 * 60;
const MINUTE_MS = 60_000;

/** A session or a shift as the API sends it. */
export interface Span {
  startsAt: string;
  endsAt: string;
}

/** Where a drag lands. */
export interface Move {
  startsAt: Date;
  endsAt: Date;
}

/** Nearest slot boundary (15 min); halves go to the later slot. */
export function snapToSlot(minutes: number, step = SLOT_MINUTES): number {
  return Math.round(minutes / step) * step + 0; // + 0 turns -0 into 0
}

/** Minutes since local midnight on the wall clock (seconds as a fraction). */
export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

/** Local midnight of the calendar day of `date`. */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** `minutes` after local midnight of `day`, read on the wall clock (1440 is the next midnight). */
export function atDayMinutes(day: Date, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes);
}

/** Whole calendar days from the day of `from` to the day of `to` (DST days count as one). */
export function calendarDayDiff(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

export function durationMs(span: Span): number {
  return new Date(span.endsAt).getTime() - new Date(span.startsAt).getTime();
}

/** Pointer travel → minutes. On a horizontal axis in RTL, time runs right to left. */
export function pxToMinutes(px: number, pxPerMinute: number, axis: 'x' | 'y' = 'y', dir: 'ltr' | 'rtl' = 'ltr'): number {
  const signed = axis === 'x' && dir === 'rtl' ? -px : px;
  return signed / pxPerMinute;
}

/**
 * Start minute (of the day) after dragging the start by `deltaMinutes`: snapped to a 15-minute slot and
 * kept inside [min, max − duration] so the span stays in the visible range of the day. A span that already
 * ends after `max` (a night shift running past midnight) keeps its start as the latest one: picking it up
 * never pulls it back into the day.
 */
export function dragStartMinute(
  originalStart: Date,
  deltaMinutes: number,
  durationMinutes: number,
  bounds: { min: number; max: number } = { min: 0, max: DAY_MINUTES },
): number {
  const start = minutesOfDay(originalStart);
  const snapped = snapToSlot(start + deltaMinutes);
  const earliest = Math.ceil(bounds.min / SLOT_MINUTES) * SLOT_MINUTES;
  const max = Math.max(bounds.max, start + durationMinutes);
  const latest = Math.floor((max - durationMinutes) / SLOT_MINUTES) * SLOT_MINUTES;
  return Math.max(earliest, Math.min(Math.max(earliest, latest), snapped));
}

/** The span moved to `startMinute` (wall clock) of `day`, with the same duration. */
export function moveSpan(span: Span, day: Date, startMinute: number): Move {
  const startsAt = atDayMinutes(day, startMinute);
  return { startsAt, endsAt: new Date(startsAt.getTime() + durationMs(span)) };
}

/**
 * The span with its end dragged by `deltaMinutes`: snapped to a slot, at least one slot after the start
 * and at most `maxMinute` of the start's day (1440 = midnight), or its current end when that is later
 * (a span past midnight can be shortened, never cut when its end is picked up).
 */
export function resizeSpan(span: Span, deltaMinutes: number, maxMinute = DAY_MINUTES): Move {
  const startsAt = new Date(span.startsAt);
  const end = new Date(span.endsAt);
  const day = startOfLocalDay(startsAt);
  const endMinute = calendarDayDiff(day, end) * DAY_MINUTES + minutesOfDay(end);
  const shortest = minutesOfDay(startsAt) + SLOT_MINUTES;
  const next = Math.max(shortest, Math.min(Math.max(maxMinute, endMinute), snapToSlot(endMinute + deltaMinutes)));
  return { startsAt, endsAt: atDayMinutes(day, next) };
}

/** True when the move changes nothing (to the minute). */
export function sameSpan(span: Span, next: Move): boolean {
  const minute = (date: Date | string) => Math.floor(new Date(date).getTime() / MINUTE_MS);
  return minute(span.startsAt) === minute(next.startsAt) && minute(span.endsAt) === minute(next.endsAt);
}

export type MoveRefusal = 'started' | 'past';

/** A class that started stays put, and none lands in the past (members would get no-show strikes). */
export function classMoveRefusal(span: Span, next: Move, now: Date = new Date()): MoveRefusal | null {
  if (new Date(span.startsAt).getTime() <= now.getTime()) return 'started';
  if (next.startsAt.getTime() <= now.getTime()) return 'past';
  return null;
}

export interface LaneItem {
  id: string;
  start: number;
  end: number;
}

/** Overlapping items of one day share the width: each gets a lane and the lane count of its group. */
export function layoutLanes(items: LaneItem[]): Map<string, { lane: number; lanes: number }> {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id));
  const result = new Map<string, { lane: number; lanes: number }>();
  let group: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;
  const flush = () => {
    for (const item of group) result.set(item.id, { lane: item.lane, lanes: laneEnds.length });
    group = [];
    laneEnds = [];
    groupEnd = -Infinity;
  };
  for (const item of sorted) {
    if (group.length && item.start >= groupEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    group.push({ id: item.id, lane });
    groupEnd = Math.max(groupEnd, item.end);
  }
  flush();
  return result;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const ARROWS: Record<string, { dx: number; dy: number }> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
};

/**
 * Keyboard drag: where an arrow key takes the dragged box (its new top-left corner). On an axis with a
 * step (minutes on a time axis) the box moves by that many pixels; otherwise it jumps to the next drop
 * target (day column, employee row, cell) in the arrow's direction on screen, so RTL layouts move the
 * way the arrow points. Null when nothing lies that way.
 */
export function nextKeyboardPosition(code: string, box: Box, targets: Box[], steps: { x?: number; y?: number } = {}): { x: number; y: number } | null {
  const arrow = ARROWS[code];
  if (!arrow) return null;
  const horizontal = arrow.dx !== 0;
  const sign = horizontal ? arrow.dx : arrow.dy;
  const step = horizontal ? steps.x : steps.y;
  if (step) {
    return horizontal ? { x: box.left + sign * step, y: box.top } : { x: box.left, y: box.top + sign * step };
  }
  const center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  const contains = (target: Box) =>
    center.x >= target.left && center.x <= target.left + target.width && center.y >= target.top && center.y <= target.top + target.height;
  const ahead = targets
    .filter((target) => !contains(target)) // the target the box is over now
    .map((target) => ({ target, cx: target.left + target.width / 2, cy: target.top + target.height / 2 }))
    .filter(({ cx, cy }) => (horizontal ? (cx - center.x) * sign > 1 : (cy - center.y) * sign > 1));
  // Prefer targets in line with the box (same row for left/right, same column for up/down).
  const inLine = ahead.filter(({ target }) =>
    horizontal ? center.y >= target.top && center.y <= target.top + target.height : center.x >= target.left && center.x <= target.left + target.width,
  );
  const pool = inLine.length ? inLine : ahead;
  if (!pool.length) return null;
  const distance = (p: { cx: number; cy: number }) => Math.hypot(p.cx - center.x, p.cy - center.y);
  const best = pool.reduce((a, b) => (distance(b) < distance(a) ? b : a));
  return horizontal ? { x: best.cx - box.width / 2, y: box.top } : { x: box.left, y: best.cy - box.height / 2 };
}
