import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { AttendanceDto, EmployeePosition, ShiftDto } from '../../../api/types-ops';
import { formatTime, hourLabel } from '../../../lib/format';
import { POSITION_LABELS } from '../../../lib/labels-ops';
import { ChartCard, DataTableMini, LegendKey } from '../../charts/ChartCard';
import { useChartColors } from '../../charts/useChartColors';
import { useI18n } from '../../../i18n';

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

/**
 * Gantt-like day view: one row per employee, planned shifts as bars in the
 * position colour, clocked presence as a thin neutral bar underneath, and a
 * "now" line on today.
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
          <div className="relative ml-[132px] h-5 text-[11px] text-muted" aria-hidden>
            {ticks.map((h) => (
              <span key={h} className="absolute -translate-x-1/2 tabular" style={{ left: pct(h) }}>
                {hourLabel(h)}
              </span>
            ))}
          </div>
          <ul className="relative">
            {rows.map((row) => {
              const rowShifts = shifts.filter((s) => s.employeeId === row.employeeId);
              const rowAttendance = attendance.filter((a) => a.employeeId === row.employeeId);
              return (
                <li key={row.employeeId} className="flex h-11 items-center border-b border-line/60 last:border-0">
                  <span className="w-[132px] shrink-0 truncate pr-3 text-sm text-fg" title={row.name}>
                    {row.name}
                  </span>
                  <div
                    className={clsx('relative h-full flex-1', onEmptyClick && 'cursor-copy')}
                    style={{ backgroundImage: `repeating-linear-gradient(90deg, ${c.grid} 0 1px, transparent 1px ${100 / span}%)` }}
                    onClick={(e) => {
                      if (!onEmptyClick || e.target !== e.currentTarget) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      onEmptyClick(row, Math.floor(from + ((e.clientX - rect.left) / rect.width) * span));
                    }}
                  >
                    {rowShifts.map((s) => {
                      const a = hoursOf(s.startsAt, day);
                      const b = hoursOf(s.endsAt, day);
                      const label = `${formatTime(s.startsAt)}–${formatTime(s.endsAt)}${s.task ? ` ${s.task}` : ''}`;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={!onShiftClick}
                          onClick={() => onShiftClick?.(s)}
                          title={`${row.name} : ${label}${s.roomName ? `, ${s.roomName}` : ''}`}
                          className="absolute top-1.5 flex h-5 items-center overflow-hidden rounded px-1.5 text-[11px] font-semibold whitespace-nowrap hover:brightness-110 disabled:cursor-default"
                          style={{ left: pct(a), width: width(a, b), background: color(row.position), color: labelInk(row.position) }}
                        >
                          <span className="truncate">{label}</span>
                        </button>
                      );
                    })}
                    {rowAttendance.map((att) => {
                      const a = hoursOf(att.clockIn, day);
                      const b = att.clockOut ? hoursOf(att.clockOut, day) : isToday ? nowH : a;
                      return (
                        <span
                          key={att.id}
                          className="absolute bottom-1.5 h-1 rounded-full"
                          style={{ left: pct(a), width: width(a, Math.max(b, a + 0.05)), background: c.fg2 }}
                          title={t('Pointé {from}–{to}', { from: formatTime(att.clockIn), to: att.clockOut ? formatTime(att.clockOut) : t('en cours') })}
                        />
                      );
                    })}
                  </div>
                </li>
              );
            })}
            {isToday && nowH >= from && nowH <= to && (
              <span className="pointer-events-none absolute top-0 bottom-0 ml-[132px] w-0" style={{ left: `calc((100% - 132px) * ${(nowH - from) / span})` }}>
                <span className="absolute inset-y-0 w-px" style={{ background: c.fg }} />
                <span className="absolute -top-5 -translate-x-1/2 rounded bg-fg px-1 text-[10px] font-semibold text-page">{formatTime(now)}</span>
              </span>
            )}
          </ul>
        </div>
      )}
    </ChartCard>
  );
}
