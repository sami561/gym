import type { ClassSessionDto } from '../api/types';
import { addGymDays, gymDay, gymNoon } from '../lib/gymTime';

/** The 7 gym days from today, each with its classes in start order: the same days and hours as the back office. */
export function scheduleDays(sessions: ClassSessionDto[], now: Date = new Date()) {
  const byDay = new Map<string, ClassSessionDto[]>();
  sessions.forEach((session) => {
    const key = gymDay(session.startsAt);
    byDay.set(key, [...(byDay.get(key) ?? []), session]);
  });
  const today = gymDay(now);
  return Array.from({ length: 7 }, (_, i) => {
    const key = addGymDays(today, i);
    return {
      key,
      date: gymNoon(key),
      sessions: (byDay.get(key) ?? []).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    };
  });
}
