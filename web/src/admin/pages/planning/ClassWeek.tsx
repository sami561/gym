import { useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  DndContext,
  useDraggable,
  useDroppable,
  type Announcements,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Ban, Lock, Users } from 'lucide-react';
import clsx from 'clsx';
import type { ClassSessionDto } from '../../../api/types';
import { useI18n } from '../../../i18n';
import { formatDate, formatTime, formatWeekday, hourLabel, isoDay } from '../../../lib/format';
import { DRAGGABLE_CLASS, pointerOrClosest, useCalendarSensors } from '../../calendar/dnd';
import { hoursLabel, spanLabel } from '../../calendar/labels';
import {
  DAY_MINUTES,
  SLOT_MINUTES,
  calendarDayDiff,
  classMoveRefusal,
  dragStartMinute,
  durationMs,
  layoutLanes,
  minutesOfDay,
  moveSpan,
  resizeSpan,
  type Move,
  type MoveRefusal,
} from '../../calendar/slots';

const HOUR_PX = 48;
const PX_PER_MINUTE = HOUR_PX / 60;
const SLOT_PX = SLOT_MINUTES * PX_PER_MINUTE;
const DEFAULT_COLOR = '#d7141a';
const GUTTER = '3.5rem';

export interface ClassMove {
  session: ClassSessionDto;
  next: Move;
  resize: boolean;
}

interface Target extends ClassMove {
  dayIndex: number;
  refusal: MoveRefusal | null;
}

interface DragData {
  session: ClassSessionDto;
  resize?: boolean;
}

const tint = (color: string, amount: number) => `color-mix(in srgb, ${color} ${amount}%, var(--card))`;

/** End of the span in minutes after midnight of its start day (an end on the next day counts past 1440). */
function endMinute(startsAt: Date, endsAt: Date): number {
  return calendarDayDiff(startsAt, endsAt) * DAY_MINUTES + minutesOfDay(endsAt);
}

/**
 * Week of classes on a time grid: one column per day, 15-minute slots. Sessions are dragged to another
 * day or time (duration kept) or stretched from their bottom edge; the page decides what happens.
 */
export function ClassWeek({
  days,
  sessions,
  now,
  pendingIds,
  onOpen,
  onMove,
}: {
  /** The 7 days shown, local midnights. */
  days: Date[];
  sessions: ClassSessionDto[];
  now: Date;
  /** Sessions being saved: not draggable until the server answered. */
  pendingIds: ReadonlySet<string>;
  onOpen: (session: ClassSessionDto) => void;
  onMove: (move: ClassMove) => void;
}) {
  const { t } = useI18n();
  const dayKeys = days.map((d) => isoDay(d));
  const keysSignature = dayKeys.join();
  const todayIndex = dayKeys.indexOf(isoDay(now));

  // Sessions of the shown days with their column, minutes and lane.
  const placed = useMemo(() => {
    const keys = keysSignature.split(',');
    const items = sessions
      .map((session) => {
        const start = new Date(session.startsAt);
        const end = new Date(session.endsAt);
        return { session, dayIndex: keys.indexOf(isoDay(start)), start: minutesOfDay(start), end: Math.min(DAY_MINUTES, endMinute(start, end)) };
      })
      .filter((item) => item.dayIndex >= 0);
    const lanes = new Map<string, { lane: number; lanes: number }>();
    for (let day = 0; day < keys.length; day++) {
      const ofDay = items.filter((item) => item.dayIndex === day).map((item) => ({ id: item.session.id, start: item.start, end: Math.max(item.end, item.start + SLOT_MINUTES) }));
      layoutLanes(ofDay).forEach((value, id) => lanes.set(id, value));
    }
    return items.map((item) => ({ ...item, ...(lanes.get(item.session.id) ?? { lane: 0, lanes: 1 }) }));
  }, [sessions, keysSignature]);

  // Opening hours by default, stretched to show every session of the week.
  const firstHour = Math.min(6, ...placed.map((p) => Math.floor(p.start / 60)));
  const lastHour = Math.min(24, Math.max(22, ...placed.map((p) => Math.ceil(p.end / 60))));
  const minMinute = firstHour * 60;
  const maxMinute = lastHour * 60;
  const gridHeight = (lastHour - firstHour) * HOUR_PX;
  const y = (minute: number) => (minute - minMinute) * PX_PER_MINUTE;

  const [activeId, setActiveId] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const targetRef = useRef<Target | null>(null);

  const sensors = useCalendarSensors((id) => (id.startsWith('end:') ? { y: SLOT_PX, lockX: true } : { y: SLOT_PX }));

  const compute = (event: DragMoveEvent | DragEndEvent): Target | null => {
    const data = event.active.data.current as DragData | undefined;
    if (!data) return null;
    const { session } = data;
    const deltaMinutes = event.delta.y / PX_PER_MINUTE;
    const clock = new Date();
    if (data.resize) {
      const next = resizeSpan(session, deltaMinutes, maxMinute);
      const dayIndex = dayKeys.indexOf(isoDay(new Date(session.startsAt)));
      return { session, next, resize: true, dayIndex, refusal: classMoveRefusal(session, next, clock) };
    }
    const dayIndex = event.over?.data.current?.dayIndex as number | undefined;
    if (dayIndex === undefined) return null;
    const minute = dragStartMinute(new Date(session.startsAt), deltaMinutes, durationMs(session) / 60_000, { min: minMinute, max: maxMinute });
    const next = moveSpan(session, days[dayIndex], minute);
    return { session, next, resize: false, dayIndex, refusal: classMoveRefusal(session, next, clock) };
  };

  const remember = (next: Target | null) => {
    const previous = targetRef.current;
    targetRef.current = next;
    const same =
      previous === next ||
      (previous && next && previous.dayIndex === next.dayIndex && previous.refusal === next.refusal && previous.next.startsAt.getTime() === next.next.startsAt.getTime() && previous.next.endsAt.getTime() === next.next.endsAt.getTime());
    if (!same) setTarget(next);
  };

  const describe = (current: Target | null) =>
    !current ? t('Hors du planning.') : current.refusal ? t('{when} : impossible, c’est dans le passé.', { when: spanLabel(current.next) }) : spanLabel(current.next);
  const sessionOf = (data: unknown) => (data as DragData | undefined)?.session;
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const session = sessionOf(active.data.current);
      return session ? t('{title} saisi : {when}.', { title: session.title, when: spanLabel(session) }) : undefined;
    },
    onDragMove: () => describe(targetRef.current),
    onDragOver: () => describe(targetRef.current),
    onDragEnd: () => (targetRef.current ? t('Déposé : {when}.', { when: spanLabel(targetRef.current.next) }) : t('Déplacement annulé.')),
    onDragCancel: () => t('Déplacement annulé.'),
  };

  const onDragStart = (event: DragStartEvent) => {
    targetRef.current = null;
    setTarget(null);
    setActiveId(String(event.active.id));
  };
  const onDragEnd = (event: DragEndEvent) => {
    const final = compute(event);
    targetRef.current = final; // read by the drop announcement
    setTarget(null);
    setActiveId(null);
    if (final) onMove({ session: final.session, next: final.next, resize: final.resize });
  };
  const onDragCancel = () => {
    targetRef.current = null;
    setTarget(null);
    setActiveId(null);
  };

  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i);
  const columnWidth = 100 / days.length;
  const nowMinute = minutesOfDay(now);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerOrClosest}
      onDragStart={onDragStart}
      onDragMove={(event) => remember(compute(event))}
      onDragOver={(event) => remember(compute(event))}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: t(
            'Espace saisit le cours. Les flèches haut et bas le déplacent d’un quart d’heure, gauche et droite d’un jour. Espace ou Entrée le dépose, Échap annule. Entrée seule ouvre le détail.',
          ),
        },
      }}
    >
      <div className="scroll-thin overflow-x-auto" role="group" aria-label={t('Planning de la semaine')}>
        <div className="min-w-[860px] px-2 pb-3">
          {/* Day headers */}
          <div className="grid" style={{ gridTemplateColumns: `${GUTTER} repeat(${days.length}, minmax(0, 1fr))` }}>
            <span aria-hidden />
            {days.map((day, index) => (
              <div key={dayKeys[index]} className={clsx('border-b-2 px-2 pt-3 pb-2', index === todayIndex ? 'border-brand-500' : 'border-transparent')}>
                <p className={clsx('text-sm font-semibold', index === todayIndex ? 'text-fg' : 'text-fg-2')}>{formatWeekday(day, 'short')}</p>
                <p className="text-xs text-muted tabular">{formatDate(day, { day: 'numeric', month: 'short' })}</p>
              </div>
            ))}
          </div>

          <div className="relative grid" style={{ gridTemplateColumns: `${GUTTER} repeat(${days.length}, minmax(0, 1fr))` }}>
            {/* Hour labels */}
            <div className="relative" style={{ height: gridHeight }} aria-hidden>
              {hours.map((hour, i) => (
                <span
                  key={hour}
                  className={clsx('absolute end-2 text-[11px] text-muted tabular', i > 0 && '-translate-y-1/2')}
                  style={{ top: (hour - firstHour) * HOUR_PX }}
                >
                  {hourLabel(hour)}
                </span>
              ))}
            </div>

            {days.map((day, index) => (
              <DayColumn
                key={dayKeys[index]}
                id={`day:${dayKeys[index]}`}
                index={index}
                height={gridHeight}
                pastHeight={index < todayIndex || (todayIndex === -1 && day < now) ? gridHeight : index === todayIndex ? Math.max(0, Math.min(gridHeight, y(nowMinute))) : 0}
              />
            ))}

            {/* Sessions, the drop preview and the "now" line, over the day columns */}
            <div className="pointer-events-none absolute inset-y-0 end-0" style={{ insetInlineStart: GUTTER }}>
              {placed.map((item) => {
                const { session } = item;
                const started = new Date(session.startsAt) <= now;
                const pending = pendingIds.has(session.id);
                const top = y(item.start);
                const height = Math.max(SLOT_PX * 1.5, Math.min(gridHeight, y(item.end)) - top);
                return (
                  <SessionBlock
                    key={session.id}
                    session={session}
                    locked={started}
                    pending={pending}
                    dragging={activeId === session.id || activeId === `end:${session.id}`}
                    height={height}
                    style={{
                      top,
                      height,
                      insetInlineStart: `calc(${(item.dayIndex + item.lane / item.lanes) * columnWidth}% + 2px)`,
                      width: `calc(${columnWidth / item.lanes}% - 4px)`,
                    }}
                    onOpen={() => onOpen(session)}
                  />
                );
              })}

              {target && <DropPreview target={target} top={y(minutesOfDay(target.next.startsAt))} bottom={Math.min(gridHeight, y(endMinute(target.next.startsAt, target.next.endsAt)))} left={target.dayIndex * columnWidth} width={columnWidth} />}

              {todayIndex >= 0 && nowMinute >= minMinute && nowMinute <= maxMinute && (
                <div
                  className="absolute h-0.5 bg-brand-500"
                  style={{ top: y(nowMinute), insetInlineStart: `${todayIndex * columnWidth}%`, width: `${columnWidth}%` }}
                  aria-hidden
                >
                  <span className="absolute -start-1 -top-[3px] size-2 rounded-full bg-brand-500" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DndContext>
  );
}

function DayColumn({ id, index, height, pastHeight }: { id: string; index: number; height: number; pastHeight: number }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { dayIndex: index } });
  return (
    <div
      ref={setNodeRef}
      className={clsx('relative border-s border-line transition-colors', isOver && 'bg-[var(--hover-wash)]')}
      style={{
        height,
        // Hour lines, and a lighter line every half hour.
        backgroundImage: 'linear-gradient(to bottom, var(--grid) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--grid) 45%, transparent) 1px, transparent 1px)',
        backgroundSize: `100% ${HOUR_PX}px, 100% ${HOUR_PX / 2}px`,
      }}
    >
      {pastHeight > 0 && (
        // Time already gone: hatched, nothing can be dropped there.
        <div
          className="pointer-events-none absolute inset-x-0 top-0"
          style={{ height: pastHeight, backgroundImage: 'repeating-linear-gradient(135deg, var(--hover-wash) 0 1px, transparent 1px 7px)' }}
          aria-hidden
        />
      )}
    </div>
  );
}

function SessionBlock({
  session,
  locked,
  pending,
  dragging,
  height,
  style,
  onOpen,
}: {
  session: ClassSessionDto;
  locked: boolean;
  pending: boolean;
  dragging: boolean;
  height: number;
  style: CSSProperties;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const movable = !locked && !pending;
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: session.id,
    data: { session } satisfies DragData,
    disabled: !movable,
    attributes: { roleDescription: t('cours déplaçable') },
  });
  const color = session.color ?? DEFAULT_COLOR;
  const compact = height < 34;
  const people = session.bookedCount + session.waitlistCount;
  const label = [
    session.title,
    spanLabel(session),
    session.coachName,
    session.room,
    session.bookedCount ? t('Réservations : {n}', { n: session.bookedCount }) : null,
    session.waitlistCount ? t('Liste d’attente : {n}', { n: session.waitlistCount }) : null,
    locked ? t('Ce cours a déjà commencé : il ne peut plus être déplacé.') : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="group pointer-events-auto absolute" style={style}>
      <button
        ref={setNodeRef}
        type="button"
        {...(movable ? attributes : {})}
        {...(movable ? listeners : {})}
        aria-label={label}
        title={locked ? t('Ce cours a déjà commencé : il ne peut plus être déplacé.') : undefined}
        onClick={onOpen}
        className={clsx(
          'relative flex h-full w-full flex-col overflow-hidden rounded-md border-s-[3px] px-1.5 text-start text-fg transition-opacity',
          DRAGGABLE_CLASS,
          compact ? 'justify-center py-0' : 'py-1',
          movable ? 'cursor-grab active:cursor-grabbing' : pending ? 'cursor-progress' : 'cursor-pointer',
          dragging && 'opacity-35',
          pending && 'animate-pulse',
          locked && 'saturate-50',
        )}
        style={{ borderInlineStartColor: color, background: tint(color, locked ? 12 : 22) }}
      >
        {compact ? (
          <span className="truncate text-[11px] leading-tight">
            <span className="text-fg-2 tabular">{formatTime(session.startsAt)}</span> <span className="font-semibold">{session.title}</span>
          </span>
        ) : (
          <>
            <span className="flex items-center gap-1 text-[11px] leading-tight text-fg-2 tabular">
              {locked && <Lock className="size-3 shrink-0" aria-hidden />}
              <span className="truncate">{hoursLabel(session)}</span>
              {people > 0 && (
                <span className="ms-auto flex shrink-0 items-center gap-0.5 font-semibold text-fg" aria-hidden>
                  <Users className="size-3" />
                  {session.bookedCount}
                  {session.waitlistCount > 0 && <span className="font-normal text-fg-2">+{session.waitlistCount}</span>}
                </span>
              )}
            </span>
            <span className={clsx('text-xs leading-tight font-semibold', height < 64 ? 'truncate' : 'line-clamp-2')}>{session.title}</span>
            {height >= 64 && session.coachName && <span className="truncate text-[11px] leading-tight text-fg-2">{session.coachName}</span>}
            {height >= 84 && session.room && <span className="truncate text-[11px] leading-tight text-muted">{session.room}</span>}
          </>
        )}
      </button>
      {movable && <EndHandle session={session} thin={height < 30} />}
    </div>
  );
}

/**
 * Bottom edge: drag (or Space then ↑ ↓) to change the end time. On short blocks (30 minutes or less) it is
 * a thinner strip, so most of the block is still there to move it.
 */
function EndHandle({ session, thin }: { session: ClassSessionDto; thin: boolean }) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `end:${session.id}`,
    data: { session, resize: true } satisfies DragData,
    attributes: { roleDescription: t('poignée de fin') },
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      aria-label={t('Heure de fin de {title} : {time}', { title: session.title, time: formatTime(session.endsAt) })}
      className={clsx(
        'absolute inset-x-1 bottom-0 flex cursor-ns-resize items-end justify-center rounded-b-md opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100',
        thin ? 'h-1.5' : 'h-2.5',
        DRAGGABLE_CLASS,
      )}
    >
      <span className={clsx('w-6 rounded-full bg-fg/45', thin ? 'mb-px h-0.5' : 'mb-0.5 h-1')} aria-hidden />
    </button>
  );
}

/** Where the dragged session will land, with its new hours in large type. */
function DropPreview({ target, top, bottom, left, width }: { target: Target; top: number; bottom: number; left: number; width: number }) {
  const { t } = useI18n();
  const color = target.session.color ?? DEFAULT_COLOR;
  const refused = target.refusal !== null;
  const height = Math.max(SLOT_PX * 2, bottom - top);
  return (
    <div
      className={clsx('absolute z-10 flex flex-col justify-start gap-0.5 overflow-hidden rounded-md px-2 py-1 shadow-lg', refused ? 'text-bad' : 'text-fg')}
      style={{
        top,
        height,
        insetInlineStart: `calc(${left}% + 2px)`,
        width: `calc(${width}% - 4px)`,
        outline: `2px dashed ${refused ? 'var(--bad-text)' : color}`,
        outlineOffset: -2,
        background: refused ? 'color-mix(in srgb, var(--bad-text) 12%, var(--card))' : tint(color, 34),
      }}
      aria-hidden
    >
      <span className="text-[15px] leading-none font-bold tracking-tight tabular">{hoursLabel(target.next)}</span>
      {refused ? (
        <span className="flex items-center gap-1 text-[11px] font-semibold">
          <Ban className="size-3" />
          {t('Dans le passé')}
        </span>
      ) : (
        <span className="truncate text-[11px] text-fg-2">{target.session.title}</span>
      )}
    </div>
  );
}
