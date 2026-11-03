import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { DndContext, useDraggable, useDroppable, type Announcements, type DragEndEvent, type DragMoveEvent } from '@dnd-kit/core';
import clsx from 'clsx';
import type { AttendanceDto, EmployeePosition, ShiftDto } from '../../../api/types-ops';
import { formatTime, hourLabel } from '../../../lib/format';
import { POSITION_LABELS } from '../../../lib/labels-ops';
import { ChartCard, DataTableMini, LegendKey } from '../../charts/ChartCard';
import { useChartColors } from '../../charts/useChartColors';
import { useI18n } from '../../../i18n';
import { DRAGGABLE_CLASS, pointerOrClosest, useCalendarSensors } from '../../calendar/dnd';
import { hoursLabel, spanLabel } from '../../calendar/labels';
import { SLOT_MINUTES, dragStartMinute, durationMs, moveSpan, pxToMinutes, resizeSpan, type Move } from '../../calendar/slots';

/** Fixed slot per position: colour follows the role, never the row order. */
export const POSITION_ORDER: EmployeePosition[] = ['MANAGER', 'RECEPTION', 'COACH', 'CLEANING', 'MAINTENANCE', 'OTHER'];

export function usePositionColor(): (position: EmployeePosition | null | undefined) => string {
  const c = useChartColors();
  return (position) => (position ? c.positions[POSITION_ORDER.indexOf(position)] ?? c.other : c.other);
}

export function PositionLegend({ positions }: { positions?: EmployeePosition[] }) {
  const color = usePositionColor();
  const { t } = useI18n();
  return (
    <>
      {(positions ?? POSITION_ORDER).map((p) => (
        <LegendKey key={p} color={color(p)} label={t(POSITION_LABELS[p])} kind="rect" />
      ))}
    </>
  );
}

/** Label colour inside a position fill: near-black on the light-mode yellow, white elsewhere. */
export function labelInk(position: EmployeePosition | null | undefined): string {
  return position === 'CLEANING' && document.documentElement.dataset.theme === 'light' ? '#0b0b0b' : '#ffffff';
}

export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function hoursOf(iso: string, day: Date): number {
  const d = new Date(iso);
  const base = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  return (d.getTime() - base) / 3_600_000;
}

export interface TimelineRow {
  employeeId: string;
  name: string;
  position: EmployeePosition | null;
}

/** A shift dropped on the team calendar: maybe another employee, day or time; `resize` = only the end moved. */
export interface ShiftMove {
  shift: ShiftDto;
  employeeId: string;
  next: Move;
  resize: boolean;
}

interface ShiftDragData {
  shift: ShiftDto;
  resize?: boolean;
}

const LABEL_WIDTH = 132;

/**
 * Gantt-like day view: one row per employee, planned shifts as bars in the
 * position colour, clocked presence as a thin neutral bar underneath, and a
 * "now" line on today. Like the other charts it reads left to right in every language.
 * With `onShiftMove`, bars can be dragged to another time (15-minute slots) or
 * employee, and stretched from their end.
 */
export function ShiftTimeline({
  day,
  rows,
  shifts,
  attendance = [],
  startHour,
  endHour,
  onShiftClick,
  onEmptyClick,
  onShiftMove,
  pendingIds,
  title,
  subtitle,
}: {
  day: Date;
  rows: TimelineRow[];
  shifts: ShiftDto[];
  attendance?: AttendanceDto[];
  startHour?: number;
  endHour?: number;
  onShiftClick?: (shift: ShiftDto) => void;
  onEmptyClick?: (row: TimelineRow, hour: number) => void;
  onShiftMove?: (move: ShiftMove) => void;
  /** Shifts being saved: not draggable until the server answered. */
  pendingIds?: ReadonlySet<string>;
  title?: string;
  subtitle?: string;
}) {
  const c = useChartColors();
  const color = usePositionColor();
  const now = useNow();
  const { t } = useI18n();
  const times = shifts.flatMap((s) => [hoursOf(s.startsAt, day), hoursOf(s.endsAt, day)]);
  const from = Math.max(0, Math.floor(Math.min(startHour ?? 6, ...times)));
  const to = Math.min(24, Math.ceil(Math.max(endHour ?? 22, ...times)));
  const span = Math.max(1, to - from);
  const pct = (h: number) => `${((Math.min(Math.max(h, from), to) - from) / span) * 100}%`;
  const width = (a: number, b: number) => `${((Math.min(b, to) - Math.max(a, from)) / span) * 100}%`;
  const isToday = new Date(day).toDateString() === now.toDateString();
  const nowH = hoursOf(now.toISOString(), day);
  const ticks = Array.from({ length: span + 1 }, (_, i) => from + i).filter((h) => (span > 12 ? h % 2 === 0 : true));
  const positionsUsed = POSITION_ORDER.filter((p) => rows.some((r) => r.position === p));

  // Drag and drop (team calendar only).
  const draggable = Boolean(onShiftMove);
  const listRef = useRef<HTMLUListElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [target, setTarget] = useState<ShiftMove | null>(null);
  const targetRef = useRef<ShiftMove | null>(null);
  const pxPerMinute = () => {
    const track = listRef.current?.querySelector<HTMLElement>('[data-track]');
    return (track?.getBoundingClientRect().width || 600) / (span * 60);
  };
  // The direction the bars are laid out in (ChartCard keeps charts left to right, even in Arabic).
  const axisDir = (): 'ltr' | 'rtl' => (listRef.current && getComputedStyle(listRef.current).direction === 'rtl' ? 'rtl' : 'ltr');
  const sensors = useCalendarSensors((id) => ({ x: SLOT_MINUTES * pxPerMinute(), lockY: id.startsWith('end:') }));

  const compute = (event: DragMoveEvent | DragEndEvent): ShiftMove | null => {
    const data = event.active.data.current as ShiftDragData | undefined;
    if (!data) return null;
    const { shift } = data;
    const deltaMinutes = pxToMinutes(event.delta.x, pxPerMinute(), 'x', axisDir());
    if (data.resize) return { shift, employeeId: shift.employeeId, next: resizeSpan(shift, deltaMinutes, to * 60), resize: true };
    const employeeId = event.over?.data.current?.employeeId as string | undefined;
    if (!employeeId) return null;
    const minute = dragStartMinute(new Date(shift.startsAt), deltaMinutes, durationMs(shift) / 60_000, { min: from * 60, max: to * 60 });
    return { shift, employeeId, next: moveSpan(shift, day, minute), resize: false };
  };
  const remember = (next: ShiftMove | null) => {
    const previous = targetRef.current;
    targetRef.current = next;
    const same =
      previous === next ||
      (previous && next && previous.employeeId === next.employeeId && previous.next.startsAt.getTime() === next.next.startsAt.getTime() && previous.next.endsAt.getTime() === next.next.endsAt.getTime());
    if (!same) setTarget(next);
  };
  const nameOf = (employeeId: string) => rows.find((r) => r.employeeId === employeeId)?.name ?? '';
  const describe = (move: ShiftMove | null) => (move ? t('Vers {name} : {when}', { name: nameOf(move.employeeId), when: spanLabel(move.next) }) : t('Hors du planning.'));
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const shift = (active.data.current as ShiftDragData | undefined)?.shift;
      return shift ? t('Créneau de {name} saisi : {when}.', { name: shift.employeeName, when: spanLabel(shift) }) : undefined;
    },
    onDragMove: () => describe(targetRef.current),
    onDragOver: () => describe(targetRef.current),
    onDragEnd: () => {
      const move = targetRef.current;
      return move ? t('Déposé : {when}.', { when: `${nameOf(move.employeeId)}, ${spanLabel(move.next)}` }) : t('Déplacement annulé.');
    },
    onDragCancel: () => t('Déplacement annulé.'),
  };
  const reset = () => {
    setTarget(null);
    setActiveId(null);
  };

  const list = (
    <ul ref={listRef} className="relative">
      {rows.map((row) => {
        const rowShifts = shifts.filter((s) => s.employeeId === row.employeeId);
        const rowAttendance = attendance.filter((a) => a.employeeId === row.employeeId);
        const ghost = target && target.employeeId === row.employeeId ? target : null;
        return (
          <li key={row.employeeId} className="flex h-11 items-center border-b border-line/60 last:border-0">
            <span className="shrink-0 truncate pe-3 text-sm text-fg" style={{ width: LABEL_WIDTH }} title={row.name}>
              {row.name}
            </span>
            <Track
              employeeId={row.employeeId}
              droppable={draggable}
              className={clsx('relative h-full flex-1', onEmptyClick && 'cursor-copy')}
              style={{ backgroundImage: `repeating-linear-gradient(90deg, ${c.grid} 0 1px, transparent 1px ${100 / span}%)` }}
              onClick={(e) => {
                if (!onEmptyClick || e.target !== e.currentTarget) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const offset = getComputedStyle(e.currentTarget).direction === 'rtl' ? rect.right - e.clientX : e.clientX - rect.left;
                onEmptyClick(row, Math.floor(from + (offset / rect.width) * span));
              }}
            >
              {rowShifts.map((s) => {
                const a = hoursOf(s.startsAt, day);
                const b = hoursOf(s.endsAt, day);
                const label = `${formatTime(s.startsAt)}–${formatTime(s.endsAt)}${s.task ? ` ${s.task}` : ''}`;
                const bar = {
                  shift: s,
                  label,
                  title: `${row.name} : ${label}${s.roomName ? `, ${s.roomName}` : ''}`,
                  style: { insetInlineStart: pct(a), width: width(a, b) },
                  fill: color(row.position),
                  ink: labelInk(row.position),
                  onClick: onShiftClick ? () => onShiftClick(s) : undefined,
                };
                return draggable ? (
                  <DraggableBar key={s.id} {...bar} pending={pendingIds?.has(s.id) ?? false} dragging={activeId === s.id || activeId === `end:${s.id}`} />
                ) : (
                  <StaticBar key={s.id} {...bar} />
                );
              })}
              {ghost && (
                <span
                  className="pointer-events-none absolute top-1 z-10 flex h-6 items-center overflow-hidden rounded px-1.5 text-[11px] font-bold whitespace-nowrap text-fg tabular shadow-lg"
                  style={{
                    insetInlineStart: pct(hoursOf(ghost.next.startsAt.toISOString(), day)),
                    width: width(hoursOf(ghost.next.startsAt.toISOString(), day), hoursOf(ghost.next.endsAt.toISOString(), day)),
                    outline: `2px dashed ${color(row.position)}`,
                    outlineOffset: -2,
                    background: `color-mix(in srgb, ${color(row.position)} 30%, var(--card))`,
                  }}
                  aria-hidden
                >
                  {hoursLabel(ghost.next)}
                </span>
              )}
              {rowAttendance.map((att) => {
                const a = hoursOf(att.clockIn, day);
                const b = att.clockOut ? hoursOf(att.clockOut, day) : isToday ? nowH : a;
                return (
                  <span
                    key={att.id}
                    className="pointer-events-none absolute bottom-1.5 h-1 rounded-full"
                    style={{ insetInlineStart: pct(a), width: width(a, Math.max(b, a + 0.05)), background: c.fg2 }}
                    title={t('Pointé {from}–{to}', { from: formatTime(att.clockIn), to: att.clockOut ? formatTime(att.clockOut) : t('en cours') })}
                  />
                );
              })}
            </Track>
          </li>
        );
      })}
      {isToday && nowH >= from && nowH <= to && (
        <span className="pointer-events-none absolute top-0 bottom-0 w-0" style={{ insetInlineStart: `calc(${LABEL_WIDTH}px + (100% - ${LABEL_WIDTH}px) * ${(nowH - from) / span})` }}>
          <span className="absolute inset-y-0 w-px" style={{ background: c.fg }} />
          <span className="absolute -top-5 -translate-x-1/2 rounded bg-fg px-1 text-[10px] font-semibold text-page">{formatTime(now)}</span>
        </span>
      )}
    </ul>
  );

  return (
    <ChartCard
      title={title ?? t('Planning du jour')}
      subtitle={subtitle}
      legend={
        <>
          <PositionLegend positions={positionsUsed} />
          {attendance.length > 0 && <LegendKey color={c.fg2} label={t('Présence pointée')} />}
        </>
      }
      table={
        <DataTableMini
          head={[t('Employé'), t('Prévu'), t('Pointé')]}
          rows={rows.map((r) => [
            r.name,
            shifts.filter((s) => s.employeeId === r.employeeId).map((s) => `${formatTime(s.startsAt)}–${formatTime(s.endsAt)}`).join(', ') || '—',
            attendance
              .filter((a) => a.employeeId === r.employeeId)
              .map((a) => `${formatTime(a.clockIn)}–${a.clockOut ? formatTime(a.clockOut) : t('en cours')}`)
              .join(', ') || '—',
          ])}
        />
      }
    >
      {rows.length === 0 ? (
        <p className="px-3 py-8 text-center text-sm text-muted">{t('Personne n’est planifié ce jour-là.')}</p>
      ) : (
        <div className="px-3">
          <div className="relative h-5 text-[11px] text-muted" style={{ marginInlineStart: LABEL_WIDTH }} aria-hidden>
            {ticks.map((h) => (
              <span key={h} className="absolute -translate-x-1/2 tabular" style={{ insetInlineStart: pct(h) }}>
                {hourLabel(h)}
              </span>
            ))}
          </div>
          {draggable ? (
            <DndContext
              sensors={sensors}
              collisionDetection={pointerOrClosest}
              onDragStart={(event) => {
                targetRef.current = null;
                setTarget(null);
                setActiveId(String(event.active.id));
              }}
              onDragMove={(event) => remember(compute(event))}
              onDragOver={(event) => remember(compute(event))}
              onDragEnd={(event) => {
                const final = compute(event);
                targetRef.current = final;
                reset();
                if (final) onShiftMove?.(final);
              }}
              onDragCancel={() => {
                targetRef.current = null;
                reset();
              }}
              accessibility={{
                announcements,
                screenReaderInstructions: {
                  draggable: t(
                    'Espace saisit le créneau. Les flèches gauche et droite le déplacent d’un quart d’heure, haut et bas vers un autre employé. Espace ou Entrée le dépose, Échap annule. Entrée seule ouvre le détail.',
                  ),
                },
              }}
            >
              {list}
            </DndContext>
          ) : (
            list
          )}
        </div>
      )}
    </ChartCard>
  );
}

/** One employee's line of the day: a drop target when shifts can be dragged. */
function Track({
  employeeId,
  droppable,
  children,
  ...rest
}: { employeeId: string; droppable: boolean; children: ReactNode } & Pick<HTMLAttributes<HTMLDivElement>, 'className' | 'style' | 'onClick'>) {
  return droppable ? (
    <DroppableTrack employeeId={employeeId} {...rest}>
      {children}
    </DroppableTrack>
  ) : (
    <div data-track {...rest}>
      {children}
    </div>
  );
}

function DroppableTrack({ employeeId, children, className, ...rest }: { employeeId: string; children: ReactNode } & Pick<HTMLAttributes<HTMLDivElement>, 'className' | 'style' | 'onClick'>) {
  const { setNodeRef, isOver } = useDroppable({ id: `row:${employeeId}`, data: { employeeId } });
  return (
    <div ref={setNodeRef} data-track className={clsx(className, isOver && 'bg-[var(--hover-wash)]')} {...rest}>
      {children}
    </div>
  );
}

interface BarProps {
  shift: ShiftDto;
  label: string;
  title: string;
  style: CSSProperties;
  fill: string;
  ink: string;
  onClick?: () => void;
}

const BAR_CLASS = 'flex h-full w-full items-center overflow-hidden rounded px-1.5 text-start text-[11px] font-semibold whitespace-nowrap hover:brightness-110';

function StaticBar({ label, title, style, fill, ink, onClick }: BarProps) {
  return (
    <span className="absolute top-1.5 h-5" style={style}>
      <button type="button" disabled={!onClick} onClick={onClick} title={title} className={clsx(BAR_CLASS, 'disabled:cursor-default')} style={{ background: fill, color: ink }}>
        <span className="truncate">{label}</span>
      </button>
    </span>
  );
}

function DraggableBar({ shift, label, title, style, fill, ink, onClick, pending, dragging }: BarProps & { pending: boolean; dragging: boolean }) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: shift.id,
    data: { shift } satisfies ShiftDragData,
    disabled: pending,
    attributes: { roleDescription: t('créneau déplaçable') },
  });
  return (
    <span className={clsx('group absolute top-1.5 h-5', dragging && 'opacity-35', pending && 'animate-pulse')} style={style}>
      <button
        ref={setNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        onClick={onClick}
        title={title}
        aria-label={title}
        className={clsx(BAR_CLASS, DRAGGABLE_CLASS, pending ? 'cursor-progress' : 'cursor-grab active:cursor-grabbing')}
        style={{ background: fill, color: ink }}
      >
        <span className="truncate">{label}</span>
      </button>
      {!pending && <EndGrip shift={shift} />}
    </span>
  );
}

/** Inline end of a bar: drag (or Space then ← →) to change when the shift ends. */
function EndGrip({ shift }: { shift: ShiftDto }) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `end:${shift.id}`,
    data: { shift, resize: true } satisfies ShiftDragData,
    attributes: { roleDescription: t('poignée de fin') },
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      aria-label={t('Heure de fin du créneau de {name} : {time}', { name: shift.employeeName, time: formatTime(shift.endsAt) })}
      className={clsx(
        'absolute inset-y-0 end-0 flex w-2 cursor-ew-resize items-center justify-center rounded-e opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100',
        DRAGGABLE_CLASS,
      )}
    >
      <span className="h-3 w-0.5 rounded-full bg-current opacity-70" aria-hidden />
    </button>
  );
}
