import { useMemo, useState } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { CalendarPlus, ChevronLeft, ChevronRight, Pencil, Trash2, UserCheck, UserX } from 'lucide-react';
import clsx from 'clsx';
import { classesApi, usersApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../api/auth';
import type { BookingDto, BookingStatus, ClassSessionDto, CreateClassRequest } from '../../api/types';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, EmptyState, ErrorNote, PageHeader } from '../../components/ui/Card';
import { FormModal, type FieldDef } from '../../components/ui/FormModal';
import { Modal, useConfirm } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';
import { addDays, BOOKING_STATUS_LABELS, formatDate, formatTime, formatWeekday, fullName, isoDay, startOfWeek } from '../../lib/format';
import { useI18n, type TKey } from '../../i18n';
import { spanLabel } from '../calendar/labels';
import { classMoveRefusal, sameSpan, type Move } from '../calendar/slots';
import { useNow } from './hr/team';
import { ClassWeek, type ClassMove } from './planning/ClassWeek';

/** The back office and the public site (same browser cache when staff open the site) show the new planning at once. */
function refreshClasses(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['classes'] });
  void queryClient.invalidateQueries({ queryKey: ['public', 'classes'] });
}

const CLASS_COLORS: { value: string; label: TKey }[] = [
  { value: '#d7141a', label: 'Rouge Meliora' },
  { value: '#3987e5', label: 'Bleu' },
  { value: '#199e70', label: 'Vert' },
  { value: '#c98500', label: 'Ambre' },
  { value: '#9085e9', label: 'Violet' },
  { value: '#8b9097', label: 'Acier' },
];

const STATUS_TONE: Record<BookingStatus, BadgeTone> = {
  BOOKED: 'info',
  WAITLISTED: 'warn',
  CANCELLED: 'neutral',
  LATE_CANCELLED: 'bad',
  ATTENDED: 'good',
  NO_SHOW: 'bad',
};

function classFields(coaches: { value: string; label: string }[], isNew: boolean): FieldDef[] {
  return [
    { name: 'title', label: 'Cours', required: true },
    { name: 'coachId', label: 'Coach', type: 'select', options: coaches },
    { name: 'startsAt', label: 'Début', type: 'datetime', required: true },
    { name: 'endsAt', label: 'Fin', type: 'datetime', required: true },
    { name: 'room', label: 'Salle' },
    { name: 'color', label: 'Couleur dans le planning', type: 'select', options: CLASS_COLORS },
    { name: 'capacity', label: 'Places', type: 'number', required: true, min: 1, max: 200, step: 1 },
    { name: 'waitlistCapacity', label: 'Capacité liste d’attente', type: 'number', min: 0, max: 100, step: 1, hint: '0 désactive la liste d’attente' },
    {
      name: 'spotSelection',
      label: 'Places numérotées',
      type: 'checkbox',
      hint: 'Chaque membre choisit son vélo ou son poste (1 à la capacité) en réservant.',
    },
    ...(isNew
      ? ([{ name: 'repeatWeeks', label: 'Répéter chaque semaine pendant (semaines)', type: 'number', min: 0, max: 12, step: 1, hint: '0 = séance unique' }] satisfies FieldDef[])
      : []),
    { name: 'description', label: 'Description', type: 'textarea' },
  ];
}

function SpotMap({ session, bookings }: { session: ClassSessionDto; bookings: BookingDto[] }) {
  const { t } = useI18n();
  const bySpot = new Map(bookings.filter((b) => b.spotNumber !== null && ['BOOKED', 'ATTENDED'].includes(b.status)).map((b) => [b.spotNumber!, b]));
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-fg">{t('Plan des places')}</p>
      <ol className="grid grid-cols-8 gap-1.5 sm:grid-cols-10" aria-label={t('Places numérotées')}>
        {Array.from({ length: session.capacity }, (_, i) => i + 1).map((spot) => {
          const booking = bySpot.get(spot);
          return (
            <li
              key={spot}
              title={booking ? `${spot} : ${booking.memberName}` : `${spot} : ${t('libre')}`}
              className={clsx(
                'flex aspect-square items-center justify-center rounded-md text-xs font-semibold tabular ring-1',
                booking?.status === 'ATTENDED'
                  ? 'bg-[#0ca30c]/15 text-good ring-[#0ca30c]/40'
                  : booking
                    ? 'bg-[var(--series-1)]/15 text-fg ring-[var(--series-1)]/40'
                    : 'text-muted ring-line',
              )}
            >
              {spot}
              <span className="sr-only">{booking ? `, ${booking.memberName}` : `, ${t('libre')}`}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        <span>{t('Bleu : réservée')}</span>
        <span>{t('Vert : présent')}</span>
        <span>{t('Contour seul : libre')}</span>
      </p>
    </div>
  );
}

function BookingsPanel({ session, onClose, onEdit }: { session: ClassSessionDto; onClose: () => void; onEdit: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['class-bookings', session.id], queryFn: () => classesApi.bookings(session.id) });
  const bookings = query.data ?? [];
  const started = new Date(session.startsAt).getTime() <= Date.now();

  const setStatus = async (booking: BookingDto, status: BookingStatus) => {
    try {
      await classesApi.setBookingStatus(booking.id, status);
      toast.success(`${booking.memberName} : ${t(BOOKING_STATUS_LABELS[status])}`);
      void queryClient.invalidateQueries({ queryKey: ['class-bookings', session.id] });
      refreshClasses(queryClient);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const groups: { title: TKey; statuses: BookingStatus[]; empty: TKey }[] = [
    { title: 'Réservés', statuses: ['BOOKED'], empty: 'Aucune réservation en attente de pointage.' },
    { title: 'Présents', statuses: ['ATTENDED'], empty: 'Personne n’est encore pointé.' },
    { title: 'Liste d’attente', statuses: ['WAITLISTED'], empty: 'Liste d’attente vide.' },
    { title: 'Absents et annulations tardives', statuses: ['NO_SHOW', 'LATE_CANCELLED'], empty: 'Aucune absence.' },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={session.title}
      description={[
        `${formatWeekday(session.startsAt)} ${formatDate(session.startsAt, { day: 'numeric', month: 'long' })}, ${formatTime(session.startsAt)} – ${formatTime(session.endsAt)}`,
        session.coachName ? t('avec {coach}', { coach: session.coachName }) : null,
        session.room,
      ]
        .filter(Boolean)
        .join(', ')}
      footer={
        <>
          {user?.role !== 'COACH' && (
            <Button
              variant="danger"
              icon={<Trash2 className="size-4" />}
              onClick={async () => {
                const ok = await confirm({
                  title: t('Supprimer ce cours ?'),
                  message: t('Réservations annulées : {n}', { n: bookings.filter((b) => b.status === 'BOOKED' || b.status === 'WAITLISTED').length }),
                  confirmLabel: t('Supprimer le cours'),
                  danger: true,
                });
                if (!ok) return;
                try {
                  await classesApi.remove(session.id);
                  toast.success(t('Cours supprimé.'));
                  refreshClasses(queryClient);
                  onClose();
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              {t('Supprimer')}
            </Button>
          )}
          <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={onEdit}>
            {t('Modifier')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg bg-page p-3 ring-1 ring-line">
            <dt className="text-muted">{t('Places restantes')}</dt>
            <dd className="text-xl font-semibold text-fg tabular">
              {session.spotsLeft} / {session.capacity}
            </dd>
          </div>
          <div className="rounded-lg bg-page p-3 ring-1 ring-line">
            <dt className="text-muted">{t('Liste d’attente')}</dt>
            <dd className="text-xl font-semibold text-fg tabular">
              {session.waitlistCount} / {session.waitlistCapacity}
            </dd>
          </div>
          <div className="rounded-lg bg-page p-3 ring-1 ring-line">
            <dt className="text-muted">{t('Annulation gratuite')}</dt>
            <dd className="font-semibold text-fg">{t('jusqu’à {time}', { time: formatTime(session.cancelDeadline) })}</dd>
          </div>
        </dl>

        {query.isError && <ErrorNote message={errorMessage(query.error)} onRetry={() => query.refetch()} />}
        {query.isLoading && <Skeleton className="h-40" />}
        {session.spotSelection && query.data && <SpotMap session={session} bookings={bookings} />}

        {query.data &&
          groups.map((group) => {
            const rows = bookings
              .filter((b) => group.statuses.includes(b.status))
              .sort((a, b) => (a.waitlistPosition ?? a.spotNumber ?? 0) - (b.waitlistPosition ?? b.spotNumber ?? 0));
            return (
              <section key={group.title}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
                  {t(group.title)}
                  <span className="rounded-full bg-card-2 px-2 text-xs text-fg-2 tabular">{rows.length}</span>
                </h3>
                {rows.length === 0 ? (
                  <p className="text-sm text-muted">{t(group.empty)}</p>
                ) : (
                  <ul className="divide-y divide-line rounded-lg ring-1 ring-line">
                    {rows.map((b) => (
                      <li key={b.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                        {b.spotNumber !== null && (
                          <span className="flex size-7 items-center justify-center rounded-md bg-card-2 text-xs font-semibold tabular" title={t('Place')}>
                            {b.spotNumber}
                          </span>
                        )}
                        {b.status === 'WAITLISTED' && b.waitlistPosition !== null && (
                          <span className="text-xs font-semibold text-warn">{t('n° {n}', { n: b.waitlistPosition })}</span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{b.memberName}</span>
                        {b.checkedInAt && <span className="text-xs text-muted">{t('pointé à {time}', { time: formatTime(b.checkedInAt) })}</span>}
                        <Badge tone={STATUS_TONE[b.status]}>{t(BOOKING_STATUS_LABELS[b.status])}</Badge>
                        {(b.status === 'BOOKED' || b.status === 'NO_SHOW' || b.status === 'ATTENDED') && (
                          <div className="flex gap-1">
                            {b.status !== 'ATTENDED' && (
                              <Button size="sm" variant="secondary" icon={<UserCheck className="size-3.5" />} onClick={() => void setStatus(b, 'ATTENDED')}>
                                {t('Présent')}
                              </Button>
                            )}
                            {b.status !== 'NO_SHOW' && started && (
                              <Button size="sm" variant="ghost" icon={<UserX className="size-3.5" />} onClick={() => void setStatus(b, 'NO_SHOW')}>
                                {t('Absent')}
                              </Button>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
      </div>
    </Modal>
  );
}

/** What the move changes, who is booked, and what they will (not) be told — the class-service sends no message. */
function MoveSummary({ session, next }: { session: ClassSessionDto; next: Move }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-col gap-0.5">
        <span className="text-muted line-through decoration-1">{spanLabel(session)}</span>
        <span className="font-semibold text-fg">{spanLabel(next)}</span>
      </p>
      <p className="text-fg">
        {session.bookedCount === 1 && t('Un membre a réservé ce cours.')}
        {session.bookedCount > 1 && t('{n} membres ont réservé ce cours.', { n: session.bookedCount })}
        {session.bookedCount > 0 && session.waitlistCount > 0 && ' '}
        {session.waitlistCount === 1 && t('Un membre est en liste d’attente.')}
        {session.waitlistCount > 1 && t('{n} membres sont en liste d’attente.', { n: session.waitlistCount })}
      </p>
      <p>
        {t('Aucun message n’est envoyé pour ce changement : seul le rappel automatique, 2 h avant le cours, donnera le nouvel horaire aux membres inscrits. Prévenez-les si besoin.')}
      </p>
    </div>
  );
}

export function PlanningPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const now = useNow(30_000);
  const [weekStart, setWeekStart] = useState(() => startOfWeek());
  const [open, setOpen] = useState<ClassSessionDto | null>(null);
  const [editing, setEditing] = useState<ClassSessionDto | 'new' | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const weekEnd = addDays(weekStart, 7);
  const weekKey = ['classes', isoDay(weekStart)];

  const query = useQuery({
    queryKey: weekKey,
    queryFn: () => classesApi.list(weekStart.toISOString(), weekEnd.toISOString()),
  });
  const coaches = useQuery({ queryKey: ['users', 'COACH'], queryFn: () => usersApi.list('COACH') });
  const coachOptions = (coaches.data ?? []).map((c) => ({ value: c.id, label: fullName(c) }));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const replace = (id: string, update: (session: ClassSessionDto) => ClassSessionDto) =>
    queryClient.setQueryData<ClassSessionDto[]>(weekKey, (list) => list?.map((s) => (s.id === id ? update(s) : s)));

  /** Drop on the grid: checks, confirmation when members are booked, then an optimistic move rolled back on error. */
  const moveSession = async ({ session, next, resize }: ClassMove) => {
    if (sameSpan(session, next)) return;
    const refusal = classMoveRefusal(session, next, new Date());
    if (refusal) {
      toast.error(refusal === 'started' ? t('Ce cours a déjà commencé : il ne peut plus être déplacé.') : t('Impossible de placer un cours dans le passé.'));
      return;
    }
    if (session.bookedCount + session.waitlistCount > 0) {
      const ok = await confirm({
        title: resize ? t('Changer l’horaire de « {title} » ?', { title: session.title }) : t('Déplacer « {title} » ?', { title: session.title }),
        message: <MoveSummary session={session} next={next} />,
        confirmLabel: resize ? t('Changer l’horaire') : t('Déplacer le cours'),
      });
      if (!ok) return;
    }
    const body = { startsAt: next.startsAt.toISOString(), endsAt: next.endsAt.toISOString() };
    setPending((ids) => new Set(ids).add(session.id));
    await queryClient.cancelQueries({ queryKey: weekKey });
    replace(session.id, (s) => ({ ...s, ...body }));
    try {
      const saved = await classesApi.update(session.id, body);
      replace(session.id, () => saved);
      toast.success(resize ? t('Horaire modifié : {when}.', { when: spanLabel(saved) }) : t('Cours déplacé : {when}.', { when: spanLabel(saved) }));
    } catch (err) {
      replace(session.id, () => session);
      toast.error(errorMessage(err));
    } finally {
      setPending((ids) => {
        const rest = new Set(ids);
        rest.delete(session.id);
        return rest;
      });
      refreshClasses(queryClient);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('Planning des cours')}
        description={t('Cours collectifs, réservations, liste d’attente et présences.')}
        actions={
          <Button icon={<CalendarPlus className="size-4" />} onClick={() => setEditing('new')}>
            {t('Nouveau cours')}
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <IconButton label={t('Semaine précédente')} onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <ChevronLeft className="size-5 rtl:-scale-x-100" />
        </IconButton>
        <p className="min-w-[220px] text-center text-sm font-semibold text-fg">
          {t('Semaine du {from} au {to}', { from: formatDate(weekStart, { day: 'numeric', month: 'long' }), to: formatDate(addDays(weekStart, 6), { day: 'numeric', month: 'long' }) })}
        </p>
        <IconButton label={t('Semaine suivante')} onClick={() => setWeekStart(addDays(weekStart, 7))}>
          <ChevronRight className="size-5 rtl:-scale-x-100" />
        </IconButton>
        <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek())}>
          {t('Cette semaine')}
        </Button>
        <p className="ms-auto max-w-md text-xs text-muted">{t('Glissez un cours vers un autre jour ou une autre heure, ou tirez son bord bas pour changer la fin. Les cours commencés restent en place.')}</p>
      </div>
      {query.isError && <ErrorNote message={errorMessage(query.error)} onRetry={() => query.refetch()} />}
      <Card className="overflow-hidden">
        {query.isLoading ? (
          <Skeleton className="m-3 h-[560px]" />
        ) : (
          <ClassWeek days={days} sessions={query.data ?? []} now={now} pendingIds={pending} onOpen={setOpen} onMove={(move) => void moveSession(move)} />
        )}
      </Card>
      {!query.isLoading && query.data?.length === 0 && (
        <EmptyState className="mt-2" title={t('Aucun cours cette semaine')} description={t('Créez un cours et répétez-le sur plusieurs semaines en une fois.')} />
      )}

      {open && (
        <BookingsPanel
          session={open}
          onClose={() => setOpen(null)}
          onEdit={() => {
            setEditing(open);
            setOpen(null);
          }}
        />
      )}

      <FormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('Nouveau cours') : t('Modifier le cours')}
        submitLabel={editing === 'new' ? t('Créer le cours') : t('Enregistrer')}
        fields={classFields(coachOptions, editing === 'new')}
        initial={
          editing === 'new' || !editing
            ? { capacity: 20, waitlistCapacity: 10, repeatWeeks: 0, color: '#d7141a', spotSelection: false }
            : { ...editing }
        }
        onSubmit={async (v) => {
          const body = v as unknown as CreateClassRequest;
          if (new Date(body.endsAt) <= new Date(body.startsAt)) throw new Error(t('La fin du cours doit être après le début.'));
          if (editing === 'new') {
            const created = await classesApi.create(body);
            toast.success(created.length > 1 ? t('{n} séances créées.', { n: created.length }) : t('Cours créé.'));
          } else if (editing) {
            const { repeatWeeks: _ignored, ...data } = body;
            void _ignored;
            await classesApi.update(editing.id, data);
            toast.success(t('Cours enregistré.'));
          }
          refreshClasses(queryClient);
        }}
      />
    </div>
  );
}
