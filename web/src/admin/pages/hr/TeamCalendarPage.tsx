import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, useDraggable, useDroppable, type Announcements, type DragEndEvent, type DragMoveEvent } from '@dnd-kit/core';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { attendanceApi, employeesApi, shiftsApi } from '../../../api/endpoints-ops';
import { errorMessage } from '../../../api/client';
import type { EmployeePosition, ShiftDto } from '../../../api/types-ops';
import { Button, IconButton } from '../../../components/ui/Button';
import { Card, EmptyState, ErrorNote, PageHeader } from '../../../components/ui/Card';
import { Select } from '../../../components/ui/Field';
import { Tabs } from '../../../components/ui/Tabs';
import { useToast } from '../../../components/ui/Toast';
import { addDays, formatDate, formatNumber, formatTime, formatWeekday, fullName, isoDay, startOfWeek } from '../../../lib/format';
import { POSITION_LABELS } from '../../../lib/labels-ops';
import { DRAGGABLE_CLASS, fromKeyboard, pointerOrClosest, useCalendarSensors, useRefocusAfterDrop } from '../../calendar/dnd';
import { hoursLabel, spanLabel } from '../../calendar/labels';
import { minutesOfDay, moveSpan, sameSpan } from '../../calendar/slots';
import { PositionLegend, ShiftTimeline, labelInk, usePositionColor, type ShiftMove } from './team';
import { ShiftModal, type ShiftDraft } from './ShiftModal';
import { useI18n } from '../../../i18n';

type View = 'week' | 'day';

function hoursLabelOf(hours: number): string {
  return `${formatNumber(hours)} h`;
}

interface CellData {
  employeeId: string;
  day: Date;
}

export function TeamCalendarPage() {
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [position, setPosition] = useState<EmployeePosition | ''>('');
  const [room, setRoom] = useState('');
  const [draft, setDraft] = useState<ShiftDraft | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const color = usePositionColor();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();

  const rangeStart = view === 'week' ? startOfWeek(anchor) : new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const rangeEnd = addDays(rangeStart, view === 'week' ? 7 : 1);
  const days = Array.from({ length: view === 'week' ? 7 : 1 }, (_, i) => addDays(rangeStart, i));
  const shiftsKey = ['shifts', rangeStart.toISOString(), rangeEnd.toISOString()];

  const employees = useQuery({ queryKey: ['employees', 'all'], queryFn: () => employeesApi.list() });
  const shifts = useQuery({
    queryKey: shiftsKey,
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

  const replace = (id: string, update: (shift: ShiftDto) => ShiftDto) =>
    queryClient.setQueryData<ShiftDto[]>(shiftsKey, (list) => list?.map((s) => (s.id === id ? update(s) : s)));

  /** Optimistic move (another day, time or employee), rolled back with the API's message when refused. */
  const moveShift = async ({ shift, employeeId, next }: ShiftMove) => {
    if (employeeId === shift.employeeId && sameSpan(shift, next)) return;
    const employee = (employees.data ?? []).find((e) => e.id === employeeId);
    const body = { employeeId, startsAt: next.startsAt.toISOString(), endsAt: next.endsAt.toISOString() };
    setPending((ids) => new Set(ids).add(shift.id));
    await queryClient.cancelQueries({ queryKey: shiftsKey });
    replace(shift.id, (s) => ({ ...s, ...body, employeeName: employee ? fullName(employee) : s.employeeName }));
    try {
      const saved = await shiftsApi.update(shift.id, body);
      replace(shift.id, () => saved);
      toast.success(t('Créneau de {name} déplacé : {when}.', { name: saved.employeeName, when: spanLabel(saved) }));
    } catch (err) {
      replace(shift.id, () => shift);
      toast.error(errorMessage(err));
    } finally {
      setPending((ids) => {
        const rest = new Set(ids);
        rest.delete(shift.id);
        return rest;
      });
      void queryClient.invalidateQueries({ queryKey: ['shifts'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'team'] });
    }
  };

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
      <p className="mb-3 text-xs text-muted">
        {view === 'week'
          ? t('Glissez un créneau vers un autre jour ou un autre employé ; il garde ses horaires. La vue Jour permet de changer l’heure.')
          : t('Glissez un créneau vers une autre heure ou un autre employé, ou tirez son bord pour changer la fin.')}
      </p>

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
          onShiftMove={(change) => void moveShift(change)}
          pendingIds={pending}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap gap-4 px-5 pt-4 text-xs text-fg-2">
            <PositionLegend />
          </div>
          {visibleEmployees.length === 0 && !employees.isLoading ? (
            <EmptyState title={t('Aucun employé actif')} description={t('Ajoutez les employés dans « Employés » pour planifier leurs créneaux.')} />
          ) : (
            <WeekBoard
              days={days}
              today={today}
              employees={visibleEmployees.map((e) => ({ id: e.id, name: fullName(e), position: e.position }))}
              shifts={visibleShifts}
              pendingIds={pending}
              onOpen={(shift) => setDraft({ shift })}
              onAdd={(employeeId, date) => setDraft({ employeeId, date })}
              onMove={(change) => void moveShift(change)}
              footer={(employeeId) => {
                const planned = totals.planned.get(employeeId) ?? 0;
                const worked = totals.worked.get(employeeId) ?? 0;
                return (
                  <>
                    <p className="font-semibold text-fg tabular">{hoursLabelOf(planned)}</p>
                    <p className={clsx('tabular', planned > 0 && worked - planned < -0.5 ? 'text-bad' : 'text-fg-2')}>{t('{hours} pointées', { hours: hoursLabelOf(worked) })}</p>
                  </>
                );
              }}
              color={color}
            />
          )}
        </Card>
      )}
      <ShiftModal draft={draft} employees={employees.data ?? []} onClose={() => setDraft(null)} />
    </div>
  );
}

interface BoardEmployee {
  id: string;
  name: string;
  position: EmployeePosition;
}

/** Week table, one row per employee: shifts are dragged to another day or employee and keep their hours. */
function WeekBoard({
  days,
  today,
  employees,
  shifts,
  pendingIds,
  onOpen,
  onAdd,
  onMove,
  footer,
  color,
}: {
  days: Date[];
  today: string;
  employees: BoardEmployee[];
  shifts: ShiftDto[];
  pendingIds: ReadonlySet<string>;
  onOpen: (shift: ShiftDto) => void;
  onAdd: (employeeId: string, date: string) => void;
  onMove: (move: ShiftMove) => void;
  footer: (employeeId: string) => ReactNode;
  color: (position: EmployeePosition | null | undefined) => string;
}) {
  const { t } = useI18n();
  const sensors = useCalendarSensors(() => ({}));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [target, setTarget] = useState<ShiftMove | null>(null);
  const targetRef = useRef<ShiftMove | null>(null);
  // Shift dropped with the keyboard: its chip, created again in the new cell, takes the focus back.
  const [refocusId, setRefocusId] = useState<string | null>(null);
  const refocused = useCallback(() => setRefocusId(null), []);

  const compute = (event: DragMoveEvent | DragEndEvent): ShiftMove | null => {
    const shift = (event.active.data.current as { shift?: ShiftDto } | undefined)?.shift;
    const cell = event.over?.data.current as CellData | undefined;
    if (!shift || !cell) return null;
    return { shift, employeeId: cell.employeeId, next: moveSpan(shift, cell.day, minutesOfDay(new Date(shift.startsAt))), resize: false };
  };
  const remember = (next: ShiftMove | null) => {
    const previous = targetRef.current;
    targetRef.current = next;
    if (previous?.employeeId !== next?.employeeId || previous?.next.startsAt.getTime() !== next?.next.startsAt.getTime()) setTarget(next);
  };
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? '';
  const describe = (move: ShiftMove | null) => (move ? t('Vers {name} : {when}', { name: nameOf(move.employeeId), when: spanLabel(move.next) }) : t('Hors du planning.'));
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const shift = (active.data.current as { shift?: ShiftDto } | undefined)?.shift;
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerOrClosest}
      onDragStart={(event) => {
        targetRef.current = null;
        setTarget(null);
        setRefocusId(null);
        setActiveId(String(event.active.id));
      }}
      onDragMove={(event) => remember(compute(event))}
      onDragOver={(event) => remember(compute(event))}
      onDragEnd={(event) => {
        const final = compute(event);
        targetRef.current = final;
        reset();
        if (!final) return;
        if (fromKeyboard(event)) setRefocusId(final.shift.id);
        onMove(final);
      }}
      onDragCancel={() => {
        targetRef.current = null;
        reset();
      }}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: t('Espace saisit le créneau. Les flèches le déplacent vers un autre jour ou un autre employé. Espace ou Entrée le dépose, Échap annule. Entrée seule ouvre le détail.'),
        },
      }}
    >
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
            {employees.map((e) => (
              <tr key={e.id} className="border-t border-line align-top">
                <th scope="row" className="px-2 py-2 text-start font-normal">
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: color(e.position) }} aria-hidden />
                    <span className="truncate font-medium text-fg">{e.name}</span>
                  </span>
                  <span className="ms-[18px] text-xs text-muted">{t(POSITION_LABELS[e.position])}</span>
                </th>
                {days.map((d) => {
                  const key = isoDay(d);
                  const cell = shifts.filter((s) => s.employeeId === e.id && isoDay(new Date(s.startsAt)) === key);
                  const ghost = target && target.employeeId === e.id && isoDay(target.next.startsAt) === key ? target : null;
                  return (
                    <td key={key} className={clsx('h-16 px-1 py-1.5', key === today && 'bg-[var(--hover-wash)]')}>
                      <DayCell employeeId={e.id} day={d}>
                        {cell.map((s) => (
                          <ShiftChip
                            key={s.id}
                            shift={s}
                            fill={color(e.position)}
                            ink={labelInk(e.position)}
                            pending={pendingIds.has(s.id)}
                            dragging={activeId === s.id}
                            refocus={refocusId === s.id}
                            onRefocused={refocused}
                            onOpen={() => onOpen(s)}
                          />
                        ))}
                        {/* Out of the flow: a ghost that made its row taller would move every row below
                            away from the drop targets dnd-kit measured when the drag started. */}
                        {ghost && (
                          <span
                            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 rounded-md px-1.5 py-1 text-[11px] leading-tight font-bold text-fg tabular"
                            style={{ outline: `2px dashed ${color(e.position)}`, outlineOffset: -2, background: `color-mix(in srgb, ${color(e.position)} 25%, var(--card))` }}
                            aria-hidden
                          >
                            {hoursLabel(ghost.next)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => onAdd(e.id, key)}
                          className="min-h-5 flex-1 rounded-md text-[11px] text-transparent ring-line hover:text-muted hover:ring-1"
                          aria-label={t('Ajouter un créneau à {name} le {date}', { name: e.name, date: formatDate(d) })}
                        >
                          +
                        </button>
                      </DayCell>
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-end text-xs">{footer(e.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DndContext>
  );
}

function DayCell({ employeeId, day, children }: { employeeId: string; day: Date; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell:${employeeId}:${isoDay(day)}`, data: { employeeId, day } satisfies CellData });
  return (
    <div ref={setNodeRef} className={clsx('relative flex h-full flex-col gap-1 rounded-md transition-shadow', isOver && 'ring-2 ring-fg-2/40')}>
      {children}
    </div>
  );
}

function ShiftChip({
  shift,
  fill,
  ink,
  pending,
  dragging,
  refocus,
  onRefocused,
  onOpen,
}: {
  shift: ShiftDto;
  fill: string;
  ink: string;
  pending: boolean;
  dragging: boolean;
  refocus: boolean;
  onRefocused: () => void;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, node } = useDraggable({
    id: shift.id,
    data: { shift },
    disabled: pending,
    attributes: { roleDescription: t('créneau déplaçable') },
  });
  useRefocusAfterDrop(node, refocus, pending, onRefocused);
  const details = `${formatTime(shift.startsAt)}–${formatTime(shift.endsAt)}${shift.task ? `, ${shift.task}` : ''}${shift.roomName ? `, ${shift.roomName}` : ''}`;
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={onOpen}
      aria-label={`${shift.employeeName}, ${spanLabel(shift)}${shift.task ? `, ${shift.task}` : ''}`}
      title={details}
      className={clsx(
        'rounded-md px-1.5 py-1 text-start text-[11px] leading-tight font-semibold transition-opacity hover:brightness-110',
        DRAGGABLE_CLASS,
        pending ? 'cursor-progress animate-pulse' : 'cursor-grab active:cursor-grabbing',
        dragging && 'opacity-35',
      )}
      style={{ background: fill, color: ink }}
    >
      <span className="block tabular">
        {formatTime(shift.startsAt)}–{formatTime(shift.endsAt)}
      </span>
      {shift.task && <span className="block truncate font-normal opacity-90">{shift.task}</span>}
    </button>
  );
}
