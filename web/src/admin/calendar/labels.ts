import { formatDate, formatTime, formatWeekday } from '../../lib/format';
import type { Move } from './slots';

/** "Jeudi 5 novembre, 18:30 – 19:30" in the interface language. */
export function spanLabel(span: Move | { startsAt: string | Date; endsAt: string | Date }): string {
  const start = new Date(span.startsAt);
  return `${formatWeekday(start)} ${formatDate(start, { day: 'numeric', month: 'long' })}, ${formatTime(start)} – ${formatTime(span.endsAt)}`;
}

/** "18:30 – 19:30" */
export function hoursLabel(span: Move | { startsAt: string | Date; endsAt: string | Date }): string {
  return `${formatTime(span.startsAt)} – ${formatTime(span.endsAt)}`;
}
