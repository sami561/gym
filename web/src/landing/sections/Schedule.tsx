import { useMemo } from 'react';
import { useI18n } from '../../lib/i18n';
import { addDays, formatDate, formatTime, isoDay } from '../../lib/format';
import type { ClassSessionDto } from '../../api/types';
import { usePublicClasses } from '../useLandingData';

export function Schedule() {
  const { t } = useI18n();
  const query = usePublicClasses();

  const days = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const byDay = new Map<string, ClassSessionDto[]>();
    (query.data ?? []).forEach((session) => {
      const key = isoDay(new Date(session.startsAt));
      byDay.set(key, [...(byDay.get(key) ?? []), session]);
    });
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      const key = isoDay(date);
      return {
        key,
        date,
        sessions: (byDay.get(key) ?? []).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      };
    });
  }, [query.data]);

  const total = days.reduce((sum, d) => sum + d.sessions.length, 0);

  return (
    <section id="planning" className="bg-steel-950 py-24 text-white sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 className="type-display text-5xl sm:text-6xl">{t('schedule.title')}</h2>
          <p className="max-w-md text-steel-300">{t('schedule.lead')}</p>
        </div>

        {!query.isLoading && total === 0 ? (
          <p className="mt-12 rounded-2xl border border-dashed border-white/15 px-6 py-12 text-center text-steel-300">{t('schedule.empty')}</p>
        ) : (
          <div className="scroll-thin mt-12 -mx-5 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0">
            <ol className="grid min-w-[880px] grid-cols-7 gap-px overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/10">
              {days.map((day, i) => (
                <li key={day.key} className="flex min-h-[220px] flex-col bg-shield">
                  <p className={i === 0 ? 'border-b border-brand-500 px-3 py-3 text-sm font-semibold capitalize' : 'border-b border-white/10 px-3 py-3 text-sm font-semibold capitalize text-steel-200'}>
                    {formatDate(day.date, { weekday: 'long', day: 'numeric' })}
                  </p>
                  <ul className="flex flex-col gap-2 p-2">
                    {query.isLoading && <li className="h-16 animate-pulse rounded-lg bg-white/5" />}
                    {day.sessions.map((session) => {
                      const left = Math.max(0, session.spotsLeft ?? session.capacity - session.bookedCount);
                      const waitlistOpen = left === 0 && (session.waitlistCapacity ?? 0) > (session.waitlistCount ?? 0);
                      return (
                        <li key={session.id} className="rounded-lg border-s-[3px] bg-steel-900 p-2.5" style={{ borderInlineStartColor: session.color ?? '#d7141a' }}>
                          <p className="text-xs text-steel-400 tabular">
                            {formatTime(session.startsAt)} – {formatTime(session.endsAt)}
                          </p>
                          <p className="mt-0.5 text-sm leading-snug font-semibold">{session.title}</p>
                          {session.coachName && (
                            <p className="mt-0.5 text-xs text-steel-400">
                              {t('schedule.with')} {session.coachName}
                            </p>
                          )}
                          <p className={left === 0 ? 'mt-1.5 text-xs font-semibold text-brand-300' : 'mt-1.5 text-xs text-steel-300'}>
                            {left === 0
                              ? waitlistOpen
                                ? t('schedule.waitlist')
                                : t('schedule.full')
                              : left === 1
                                ? t('schedule.oneSpot')
                                : `${left} ${t('schedule.spots')}`}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
