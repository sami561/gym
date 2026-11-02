import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { attendanceApi, employeesApi, shiftsApi } from '../../../api/endpoints-ops';
import { errorMessage } from '../../../api/client';
import type { EmployeePosition } from '../../../api/types-ops';
import { Button, IconButton } from '../../../components/ui/Button';
import { Card, EmptyState, ErrorNote, PageHeader } from '../../../components/ui/Card';
import { Select } from '../../../components/ui/Field';
import { Tabs } from '../../../components/ui/Tabs';
import { addDays, formatDate, formatNumber, formatTime, formatWeekday, fullName, isoDay, startOfWeek } from '../../../lib/format';
import { POSITION_LABELS } from '../../../lib/labels-ops';
import { PositionLegend, ShiftTimeline, labelInk, usePositionColor } from './team';
import { ShiftModal, type ShiftDraft } from './ShiftModal';
import { useI18n } from '../../../i18n';

type View = 'week' | 'day';

function hoursLabel(hours: number): string {
  return `${formatNumber(hours)} h`;
}

export function TeamCalendarPage() {
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [position, setPosition] = useState<EmployeePosition | ''>('');
  const [room, setRoom] = useState('');
  const [draft, setDraft] = useState<ShiftDraft | null>(null);
  const color = usePositionColor();
  const { t } = useI18n();

  const rangeStart = view === 'week' ? startOfWeek(anchor) : new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const rangeEnd = addDays(rangeStart, view === 'week' ? 7 : 1);
  const days = Array.from({ length: view === 'week' ? 7 : 1 }, (_, i) => addDays(rangeStart, i));

  const employees = useQuery({ queryKey: ['employees', 'all'], queryFn: () => employeesApi.list() });
  const shifts = useQuery({
    queryKey: ['shifts', rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: () => shiftsApi.list(rangeStart.toISOString(), rangeEnd.toISOString()),
  });
  const attendance = useQuery({
    queryKey: ['attendance', rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: () => attendanceApi.list({ from: rangeStart.toISOString(), to: rangeEnd.toISOString() }),
  });

  const rooms = useMemo(() => [...new Set((shifts.data ?? []).map((s) => s.roomName).filter(Boolean) as string[])].sort(), [shifts.data]);
  const visibleEmployees = (employees.data ?? []).filter((e) => e.status === 'ACTIVE' && (!position || e.position === position));
  const visibleShifts = (shifts.data ?? []).filter((s) => (!room || s.roomName === room) && visibleEmployees.some((e) => e.id === s.employeeId));

  const totals = useMemo(() => {
    const planned = new Map<string, number>();
    const worked = new Map<string, number>();
    visibleShifts.forEach((s) => planned.set(s.employeeId, (planned.get(s.employeeId) ?? 0) + (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 3_600_000));
    (attendance.data ?? []).forEach((a) => worked.set(a.employeeId, (worked.get(a.employeeId) ?? 0) + (a.minutes ?? 0) / 60));
    return { planned, worked };
  }, [visibleShifts, attendance.data]);

  const move = (direction: number) => setAnchor(addDays(anchor, direction * (view === 'week' ? 7 : 1)));
  const today = isoDay();

  return (
    <div>
      <PageHeader
        title={t('Calendrier de l’équipe')}
        description={t('Qui travaille quand, et les heures pointées face aux heures prévues.')}
        actions={
          <Button icon={<CalendarPlus className="size-4" />} onClick={() => setDraft({ date: isoDay(view === 'day' ? anchor : new Date()) })}>
            {t('Nouveau créneau')}
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs
          value={view}
          onChange={setView}
          items={[
            { key: 'week', label: 'Semaine' },
            { key: 'day', label: 'Jour' },
          ]}
        />
        <IconButton label={view === 'week' ? t('Semaine précédente') : t('Jour précédent')} onClick={() => move(-1)}>
          <ChevronLeft className="size-5 rtl:-scale-x-100" />
        </IconButton>
        <p className="min-w-[200px] text-center text-sm font-semibold text-fg">
          {view === 'week'
            ? t('Du {from} au {to}', { from: formatDate(rangeStart, { day: 'numeric', month: 'short' }), to: formatDate(addDays(rangeStart, 6), { day: 'numeric', month: 'short' }) })
            : `${formatWeekday(anchor)} ${formatDate(anchor, { day: 'numeric', month: 'long' })}`}
        </p>
        <IconButton label={view === 'week' ? t('Semaine suivante') : t('Jour suivant')} onClick={() => move(1)}>
          <ChevronRight className="size-5 rtl:-scale-x-100" />
        </IconButton>
        <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())}>
          {t('Aujourd’hui')}
        </Button>
        <div className="ms-auto flex flex-wrap gap-2">
          <Select value={position} onChange={(e) => setPosition(e.target.value as EmployeePosition | '')} aria-label={t('Poste')} className="w-44">
            <option value="">{t('Tous les postes')}</option>
            {(Object.keys(POSITION_LABELS) as EmployeePosition[]).map((value) => (
              <option key={value} value={value}>
                {t(POSITION_LABELS[value])}
              </option>
            ))}
          </Select>
          <Select value={room} onChange={(e) => setRoom(e.target.value)} aria-label={t('Salle')} className="w-40">
            <option value="">{t('Toutes les salles')}</option>
            {rooms.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {(shifts.isError || employees.isError) && <ErrorNote message={errorMessage(shifts.error ?? employees.error)} onRetry={() => void shifts.refetch()} />}

      {view === 'day' ? (
        <ShiftTimeline
          day={rangeStart}
          rows={visibleEmployees.map((e) => ({ employeeId: e.id, name: fullName(e), position: e.position }))}
          shifts={visibleShifts}
          attendance={attendance.data ?? []}
          title={t('Journée')}
          subtitle={t('Cliquez sur une ligne vide pour ajouter un créneau')}
          onShiftClick={(shift) => setDraft({ shift })}
          onEmptyClick={(row, hour) => setDraft({ employeeId: row.employeeId, date: isoDay(rangeStart), startHour: hour })}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap gap-4 px-5 pt-4 text-xs text-fg-2">
            <PositionLegend />
          </div>
          {visibleEmployees.length === 0 && !employees.isLoading ? (
            <EmptyState title={t('Aucun employé actif')} description={t('Ajoutez les employés dans « Employés » pour planifier leurs créneaux.')} />
          ) : (
            <div className="scroll-thin overflow-x-auto p-3">
              <table className="w-full min-w-[1080px] table-fixed border-collapse text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="w-44 px-2 py-2 text-start text-xs font-semibold text-muted">
                      {t('Employé')}
                    </th>
                    {days.map((d) => (
                      <th key={d.toISOString()} scope="col" className={clsx('px-1 py-2 text-start text-xs font-semibold', isoDay(d) === today ? 'text-fg' : 'text-muted')}>
                        {formatWeekday(d, 'short')} {d.getDate()}
                      </th>
                    ))}
                    <th scope="col" className="w-32 px-2 py-2 text-end text-xs font-semibold text-muted">
                      {t('Prévu / pointé')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEmployees.map((e) => {
                    const planned = totals.planned.get(e.id) ?? 0;
                    const worked = totals.worked.get(e.id) ?? 0;
                    const gap = worked - planned;
                    return (
                      <tr key={e.id} className="border-t border-line align-top">
                        <th scope="row" className="px-2 py-2 text-start font-normal">
                          <span className="flex items-center gap-2">
                            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: color(e.position) }} aria-hidden />
                            <span className="truncate font-medium text-fg">{fullName(e)}</span>
                          </span>
                          <span className="ms-[18px] text-xs text-muted">{t(POSITION_LABELS[e.position])}</span>
                        </th>
                        {days.map((d) => {
                          const key = isoDay(d);
                          const cell = visibleShifts.filter((s) => s.employeeId === e.id && isoDay(new Date(s.startsAt)) === key);
                          return (
                            <td key={key} className={clsx('h-16 px-1 py-1.5', key === today && 'bg-[var(--hover-wash)]')}>
                              <div className="flex h-full flex-col gap-1">
                                {cell.map((s) => (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => setDraft({ shift: s })}
                                    className="rounded-md px-1.5 py-1 text-start text-[11px] leading-tight font-semibold hover:brightness-110"
                                    style={{ background: color(e.position), color: labelInk(e.position) }}
                                    title={`${formatTime(s.startsAt)}–${formatTime(s.endsAt)}${s.task ? `, ${s.task}` : ''}${s.roomName ? `, ${s.roomName}` : ''}`}
                                  >
                                    <span className="block tabular">
                                      {formatTime(s.startsAt)}–{formatTime(s.endsAt)}
                                    </span>
                                    {s.task && <span className="block truncate font-normal opacity-90">{s.task}</span>}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => setDraft({ employeeId: e.id, date: key })}
                                  className="min-h-5 flex-1 rounded-md text-[11px] text-transparent ring-line hover:text-muted hover:ring-1"
                                  aria-label={t('Ajouter un créneau à {name} le {date}', { name: fullName(e), date: formatDate(d) })}
                                >
                                  +
                                </button>
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-2 py-2 text-end text-xs">
                          <p className="font-semibold text-fg tabular">{hoursLabel(planned)}</p>
                          <p className={clsx('tabular', planned > 0 && gap < -0.5 ? 'text-bad' : 'text-fg-2')}>{t('{hours} pointées', { hours: hoursLabel(worked) })}</p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      <ShiftModal draft={draft} employees={employees.data ?? []} onClose={() => setDraft(null)} />
    </div>
  );
}
