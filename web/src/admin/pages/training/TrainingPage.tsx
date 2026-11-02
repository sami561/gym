import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Copy, Dumbbell, Pencil, Plus, Ruler, Trash2, X } from 'lucide-react';
import { exercisesApi, measurementsApi, programsApi, ptApi } from '../../../api/endpoints-ops';
import { membersApi, usersApi } from '../../../api/endpoints';
import { errorMessage } from '../../../api/client';
import { useAuth } from '../../../api/auth';
import type { CreateProgramBody, ExerciseDto, MuscleGroup, ProgramDay, PtSessionDto, PtSessionStatus, WorkoutProgramDto } from '../../../api/types-ops';
import { Badge } from '../../../components/ui/Badge';
import { Button, IconButton } from '../../../components/ui/Button';
import { Card, CardHeader, EmptyState, ErrorNote, PageHeader } from '../../../components/ui/Card';
import { DataTable } from '../../../components/ui/DataTable';
import { Input, Select, Textarea } from '../../../components/ui/Field';
import { enumOptions, FormModal, type FieldDef } from '../../../components/ui/FormModal';
import { Modal, useConfirm } from '../../../components/ui/Modal';
import { Tabs } from '../../../components/ui/Tabs';
import { useToast } from '../../../components/ui/Toast';
import { useI18n } from '../../../i18n';
import { addDays, formatDate, formatDateTime, formatTND, fullName, isoDay } from '../../../lib/format';
import { MUSCLE_GROUP_LABELS, PT_STATUS } from '../../../lib/labels-ops';
import { WeightChart } from '../../charts/Charts';

type TabKey = 'programs' | 'exercises' | 'measurements' | 'pt';

/** Debounced member search returning a small list (programs, measurements, PT sessions). */
function MemberPicker({ value, onChange }: { value: { id: string; name: string } | null; onChange: (m: { id: string; name: string } | null) => void }) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);
  const members = useQuery({ queryKey: ['members', 'picker', debounced], queryFn: () => membersApi.list({ search: debounced, pageSize: 6 }), enabled: debounced.length >= 2 && !value });
  if (value) {
    return (
      <div className="flex h-10 items-center justify-between rounded-lg bg-page px-3 text-sm ring-1 ring-line">
        <span className="font-medium text-fg">{value.name}</span>
        <button type="button" onClick={() => onChange(null)} className="text-fg-2 hover:text-fg" aria-label={t('Changer de membre')}>
          <X className="size-4" />
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Input aria-label={t('Membre')} placeholder={t('Nom, téléphone ou code membre')} value={search} onChange={(e) => setSearch(e.target.value)} />
      {members.data && members.data.items.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg bg-card shadow-xl ring-1 ring-line">
          {members.data.items.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => onChange({ id: m.id, name: fullName(m) })} className="w-full px-3 py-2 text-start text-sm hover:bg-card-2">
                {fullName(m)} <span className="text-xs text-muted">{m.memberCode}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExercisesTab() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [group, setGroup] = useState<MuscleGroup | ''>('');
  const [editing, setEditing] = useState<ExerciseDto | 'new' | null>(null);
  const exercises = useQuery({ queryKey: ['exercises'], queryFn: exercisesApi.list });
  const rows = (exercises.data ?? []).filter((e) => !group || e.muscleGroup === group).sort((a, b) => a.name.localeCompare(b.name));
  const fields: FieldDef[] = [
    { name: 'name', label: 'Exercice', required: true, placeholder: 'Squat barre' },
    { name: 'muscleGroup', label: 'Groupe musculaire', type: 'select', required: true, options: enumOptions(MUSCLE_GROUP_LABELS) },
    { name: 'equipment', label: 'Matériel' },
    { name: 'videoUrl', label: 'Vidéo de démonstration (URL)' },
    { name: 'description', label: 'Consignes', type: 'textarea' },
  ];
  return (
    <Card>
      <CardHeader
        title={t('Bibliothèque d’exercices')}
        actions={
          <>
            <Select value={group} onChange={(e) => setGroup(e.target.value as MuscleGroup | '')} aria-label={t('Groupe musculaire')} className="w-48">
              <option value="">{t('Tous les groupes')}</option>
              {(Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[]).map((g) => (
                <option key={g} value={g}>
                  {t(MUSCLE_GROUP_LABELS[g])}
                </option>
              ))}
            </Select>
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              {t('Nouvel exercice')}
            </Button>
          </>
        }
      />
      {exercises.isError && <ErrorNote message={errorMessage(exercises.error)} onRetry={() => exercises.refetch()} />}
      <DataTable
        rows={rows}
        rowKey={(e) => e.id}
        loading={exercises.isLoading}
        empty={<EmptyState icon={<Dumbbell className="size-8" />} title={t('Aucun exercice')} />}
        columns={[
          { key: 'name', header: 'Exercice', cell: (e) => <span className="font-medium">{e.name}</span> },
          { key: 'group', header: 'Groupe musculaire', cell: (e) => t(MUSCLE_GROUP_LABELS[e.muscleGroup]) },
          { key: 'equipment', header: 'Matériel', hideOnMobile: true, cell: (e) => e.equipment ?? '—' },
          {
            key: 'video',
            header: 'Vidéo',
            hideOnMobile: true,
            cell: (e) =>
              e.videoUrl ? (
                <a href={e.videoUrl} target="_blank" rel="noreferrer" className="text-sm underline underline-offset-2">
                  {t('Voir')}
                </a>
              ) : (
                '—'
              ),
          },
          {
            key: 'actions',
            header: <span className="sr-only">{t('Actions')}</span>,
            align: 'right',
            cell: (e) => (
              <div className="flex justify-end gap-1">
                <IconButton label={t('Modifier')} onClick={() => setEditing(e)}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton
                  label={t('Supprimer')}
                  onClick={async () => {
                    if (!(await confirm({ title: t('Supprimer {name} ?', { name: e.name }), confirmLabel: t('Supprimer'), danger: true }))) return;
                    try {
                      await exercisesApi.remove(e.id);
                      void queryClient.invalidateQueries({ queryKey: ['exercises'] });
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            ),
          },
        ]}
      />
      <FormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('Nouvel exercice') : t('Modifier l’exercice')}
        submitLabel={t('Enregistrer')}
        fields={fields}
        initial={editing === 'new' || !editing ? { muscleGroup: 'FULL_BODY' } : { ...editing }}
        onSubmit={async (v) => {
          if (editing === 'new') await exercisesApi.create(v);
          else if (editing) await exercisesApi.update(editing.id, v);
          toast.success(t('Exercice enregistré.'));
          void queryClient.invalidateQueries({ queryKey: ['exercises'] });
        }}
      />
    </Card>
  );
}

const EMPTY_DAY = (label: string): ProgramDay => ({ label, exercises: [] });

function ProgramBuilder({ program, onClose }: { program: WorkoutProgramDto | 'new'; onClose: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const exercises = useQuery({ queryKey: ['exercises'], queryFn: exercisesApi.list });
  const coaches = useQuery({ queryKey: ['users', 'COACH'], queryFn: () => usersApi.list('COACH') });
  const existing = program === 'new' ? null : program;
  const [member, setMember] = useState<{ id: string; name: string } | null>(existing ? { id: existing.memberId, name: existing.memberName } : null);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [goal, setGoal] = useState(existing?.goal ?? '');
  const [startDate, setStartDate] = useState(existing?.startDate ?? isoDay());
  const [weeks, setWeeks] = useState(String(existing?.weeks ?? 8));
  const [coachId, setCoachId] = useState(existing?.coachId ?? (user?.role === 'COACH' ? user.id : ''));
  const [days, setDays] = useState<ProgramDay[]>(existing?.days ?? [EMPTY_DAY(t('Jour {n}', { n: 1 }))]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const updateDay = (index: number, patch: Partial<ProgramDay>) => setDays((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  const updateExercise = (dayIndex: number, exIndex: number, patch: Partial<ProgramDay['exercises'][number]>) =>
    updateDay(dayIndex, { exercises: days[dayIndex].exercises.map((e, i) => (i === exIndex ? { ...e, ...patch } : e)) });
  const moveExercise = (dayIndex: number, exIndex: number, delta: number) => {
    const list = [...days[dayIndex].exercises];
    const target = exIndex + delta;
    if (target < 0 || target >= list.length) return;
    [list[exIndex], list[target]] = [list[target], list[exIndex]];
    updateDay(dayIndex, { exercises: list });
  };

  const save = async () => {
    if (!member) return setError(t('Choisissez le membre.'));
    if (!title.trim()) return setError(t('Donnez un titre au programme.'));
    setSaving(true);
    setError(null);
    const body: CreateProgramBody = {
      memberId: member.id,
      coachId: coachId || null,
      title: title.trim(),
      goal: goal.trim() || null,
      startDate,
      weeks: Number(weeks) || 1,
      days: days.map((d) => ({ ...d, exercises: d.exercises.filter((e) => e.name.trim()) })),
    };
    try {
      if (existing) {
        const { memberId: _member, ...data } = body;
        void _member;
        await programsApi.update(existing.id, data);
      } else await programsApi.create(body);
      toast.success(t('Programme enregistré.'));
      void queryClient.invalidateQueries({ queryKey: ['programs'] });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={existing ? t('Modifier le programme') : t('Nouveau programme')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Annuler')}
          </Button>
          <Button loading={saving} onClick={() => void save()}>
            {t('Enregistrer le programme')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-fg-2">{t('Membre')}</span>
            {existing ? <p className="flex h-10 items-center text-sm font-medium text-fg">{existing.memberName}</p> : <MemberPicker value={member} onChange={setMember} />}
          </div>
          <Select label={t('Coach')} value={coachId} onChange={(e) => setCoachId(e.target.value)}>
            <option value="">—</option>
            {coaches.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {fullName(c)}
              </option>
            ))}
          </Select>
          <Input label={t('Titre')} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('Prise de masse, 4 jours')} />
          <Input label={t('Objectif')} value={goal} onChange={(e) => setGoal(e.target.value)} />
          <Input label={t('Début')} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label={t('Durée (semaines)')} type="number" min={1} max={52} value={weeks} onChange={(e) => setWeeks(e.target.value)} />
        </div>

        <datalist id="exercise-library">
          {exercises.data?.map((e) => (
            <option key={e.id} value={e.name} />
          ))}
        </datalist>

        {days.map((day, dayIndex) => (
          <section key={dayIndex} className="rounded-xl bg-page p-4 ring-1 ring-line">
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label={t('Nom de la séance')} value={day.label} onChange={(e) => updateDay(dayIndex, { label: e.target.value })} className="max-w-xs font-semibold" />
              <div className="ms-auto flex gap-1">
                <IconButton label={t('Dupliquer la séance')} onClick={() => setDays((prev) => [...prev.slice(0, dayIndex + 1), { ...day, label: `${day.label} (2)` }, ...prev.slice(dayIndex + 1)])}>
                  <Copy className="size-4" />
                </IconButton>
                <IconButton label={t('Supprimer la séance')} disabled={days.length === 1} onClick={() => setDays((prev) => prev.filter((_, i) => i !== dayIndex))}>
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </div>
            <div className="scroll-thin mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th scope="col" className="pb-1 text-start font-semibold">{t('Exercice')}</th>
                    <th scope="col" className="w-20 pb-1 text-start font-semibold">{t('Séries')}</th>
                    <th scope="col" className="w-24 pb-1 text-start font-semibold">{t('Répétitions')}</th>
                    <th scope="col" className="w-24 pb-1 text-start font-semibold">{t('Charge (kg)')}</th>
                    <th scope="col" className="w-24 pb-1 text-start font-semibold">{t('Repos (s)')}</th>
                    <th scope="col" className="w-28 pb-1">
                      <span className="sr-only">{t('Actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {day.exercises.map((ex, exIndex) => (
                    <tr key={exIndex}>
                      <td className="py-1 pe-2">
                        <Input
                          aria-label={t('Exercice')}
                          list="exercise-library"
                          value={ex.name}
                          onChange={(e) => {
                            const match = exercises.data?.find((x) => x.name === e.target.value);
                            updateExercise(dayIndex, exIndex, { name: e.target.value, exerciseId: match?.id ?? null });
                          }}
                        />
                      </td>
                      <td className="py-1 pe-2">
                        <Input aria-label={t('Séries')} type="number" min={1} value={ex.sets} onChange={(e) => updateExercise(dayIndex, exIndex, { sets: Number(e.target.value) || 1 })} />
                      </td>
                      <td className="py-1 pe-2">
                        <Input aria-label={t('Répétitions')} value={ex.reps} onChange={(e) => updateExercise(dayIndex, exIndex, { reps: e.target.value })} placeholder="8-12" />
                      </td>
                      <td className="py-1 pe-2">
                        <Input aria-label={t('Charge (kg)')} type="number" min={0} step={0.5} value={ex.weightKg ?? ''} onChange={(e) => updateExercise(dayIndex, exIndex, { weightKg: e.target.value === '' ? null : Number(e.target.value) })} />
                      </td>
                      <td className="py-1 pe-2">
                        <Input aria-label={t('Repos (s)')} type="number" min={0} step={15} value={ex.restSeconds ?? ''} onChange={(e) => updateExercise(dayIndex, exIndex, { restSeconds: e.target.value === '' ? null : Number(e.target.value) })} />
                      </td>
                      <td className="py-1">
                        <div className="flex justify-end">
                          <IconButton label={t('Monter')} disabled={exIndex === 0} onClick={() => moveExercise(dayIndex, exIndex, -1)}>
                            <ArrowUp className="size-4" />
                          </IconButton>
                          <IconButton label={t('Descendre')} disabled={exIndex === day.exercises.length - 1} onClick={() => moveExercise(dayIndex, exIndex, 1)}>
                            <ArrowDown className="size-4" />
                          </IconButton>
                          <IconButton label={t('Retirer')} onClick={() => updateDay(dayIndex, { exercises: day.exercises.filter((_, i) => i !== exIndex) })}>
                            <X className="size-4" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              icon={<Plus className="size-4" />}
              onClick={() => updateDay(dayIndex, { exercises: [...day.exercises, { exerciseId: null, name: '', sets: 3, reps: '10', restSeconds: 90, weightKg: null, notes: null }] })}
            >
              {t('Ajouter un exercice')}
            </Button>
          </section>
        ))}
        <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setDays((prev) => [...prev, EMPTY_DAY(t('Jour {n}', { n: prev.length + 1 }))])}>
          {t('Ajouter une séance')}
        </Button>
        {error && <ErrorNote message={error} />}
      </div>
    </Modal>
  );
}

function ProgramsTab() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [activeOnly, setActiveOnly] = useState(true);
  const [editing, setEditing] = useState<WorkoutProgramDto | 'new' | null>(null);
  const programs = useQuery({ queryKey: ['programs', activeOnly], queryFn: () => programsApi.list({ activeOnly }) });
  return (
    <Card>
      <CardHeader
        title={t('Programmes d’entraînement')}
        description={t('Les membres retrouvent leur programme dans l’application.')}
        actions={
          <>
            <Tabs
              value={activeOnly ? 'active' : 'all'}
              onChange={(v) => setActiveOnly(v === 'active')}
              items={[
                { key: 'active', label: 'En cours' },
                { key: 'all', label: 'Tous' },
              ]}
            />
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              {t('Nouveau programme')}
            </Button>
          </>
        }
      />
      {programs.isError && <ErrorNote message={errorMessage(programs.error)} onRetry={() => programs.refetch()} />}
      <DataTable
        rows={programs.data}
        rowKey={(p) => p.id}
        loading={programs.isLoading}
        onRowClick={setEditing}
        empty={<EmptyState title={t('Aucun programme')} description={t('Créez un programme par jours et exercices pour un membre.')} />}
        columns={[
          { key: 'title', header: 'Programme', cell: (p) => <div><p className="font-medium">{p.title}</p><p className="text-xs text-muted">{p.goal ?? ''}</p></div> },
          { key: 'member', header: 'Membre', cell: (p) => p.memberName },
          { key: 'coach', header: 'Coach', hideOnMobile: true, cell: (p) => p.coachName ?? '—' },
          { key: 'period', header: 'Période', hideOnMobile: true, cell: (p) => t('{start} → {end}', { start: formatDate(p.startDate), end: formatDate(addDays(new Date(`${p.startDate}T00:00:00`), p.weeks * 7)) }) },
          { key: 'days', header: 'Séances', align: 'right', cell: (p) => p.days.length },
          {
            key: 'active',
            header: 'Statut',
            cell: (p) => (
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await programsApi.update(p.id, { isActive: !p.isActive });
                    void queryClient.invalidateQueries({ queryKey: ['programs'] });
                  } catch (err) {
                    toast.error(errorMessage(err));
                  }
                }}
                title={p.isActive ? t('Archiver') : t('Réactiver')}
              >
                {p.isActive ? <Badge tone="good">{t('En cours')}</Badge> : <Badge>{t('Archivé')}</Badge>}
              </button>
            ),
          },
        ]}
      />
      {editing && <ProgramBuilder program={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function MeasurementsTab() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [member, setMember] = useState<{ id: string; name: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const list = useQuery({ queryKey: ['measurements', member?.id], queryFn: () => measurementsApi.list(member!.id), enabled: Boolean(member) });
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-end gap-3 p-5">
        <div className="w-full max-w-md">
          <p className="mb-1.5 text-[13px] font-medium text-fg-2">{t('Membre')}</p>
          <MemberPicker value={member} onChange={setMember} />
        </div>
        {member && (
          <Button icon={<Ruler className="size-4" />} onClick={() => setAdding(true)}>
            {t('Nouvelle mesure')}
          </Button>
        )}
      </Card>
      {!member && <EmptyState title={t('Choisissez un membre')} description={t('Son évolution (poids, masse grasse, tours) s’affiche ici.')} />}
      {list.isError && <ErrorNote message={errorMessage(list.error)} onRetry={() => list.refetch()} />}
      {member && list.data && <WeightChart data={list.data} />}
      {member && (
        <FormModal
          open={adding}
          onClose={() => setAdding(false)}
          title={t('Nouvelle mesure')}
          submitLabel={t('Enregistrer la mesure')}
          fields={[
            { name: 'date', label: 'Date', type: 'date' },
            { name: 'weightKg', label: 'Poids (kg)', type: 'number', step: 0.1 },
            { name: 'heightCm', label: 'Taille (cm)', type: 'number', step: 0.5 },
            { name: 'bodyFatPct', label: 'Masse grasse (%)', type: 'number', step: 0.1 },
            { name: 'musclePct', label: 'Masse musculaire (%)', type: 'number', step: 0.1 },
            { name: 'waistCm', label: 'Tour de taille (cm)', type: 'number', step: 0.5 },
            { name: 'chestCm', label: 'Tour de poitrine (cm)', type: 'number', step: 0.5 },
            { name: 'hipsCm', label: 'Tour de hanches (cm)', type: 'number', step: 0.5 },
            { name: 'armCm', label: 'Tour de bras (cm)', type: 'number', step: 0.5 },
            { name: 'thighCm', label: 'Tour de cuisse (cm)', type: 'number', step: 0.5 },
            { name: 'notes', label: 'Notes', type: 'textarea' },
          ]}
          initial={{ date: isoDay() }}
          onSubmit={async (v) => {
            await measurementsApi.create(member.id, v);
            toast.success(t('Mesure enregistrée.'));
            void queryClient.invalidateQueries({ queryKey: ['measurements', member.id] });
          }}
        />
      )}
    </div>
  );
}

function PtTab() {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [from] = useState(() => addDays(new Date(new Date().setHours(0, 0, 0, 0)), -7));
  const [creating, setCreating] = useState(false);
  const [member, setMember] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState({ coachId: user?.role === 'COACH' ? user.id : '', startsAt: '', duration: '60', price: '', notes: '' });
  const coaches = useQuery({ queryKey: ['users', 'COACH'], queryFn: () => usersApi.list('COACH') });
  const sessions = useQuery({
    queryKey: ['pt', from.toISOString()],
    queryFn: () => ptApi.list({ from: from.toISOString(), to: addDays(from, 42).toISOString(), coachId: user?.role === 'COACH' ? user.id : undefined }),
  });
  const setStatus = async (s: PtSessionDto, status: PtSessionStatus) => {
    try {
      await ptApi.update(s.id, { status });
      void queryClient.invalidateQueries({ queryKey: ['pt'] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const create = async () => {
    if (!member || !form.coachId || !form.startsAt) return;
    const start = new Date(form.startsAt);
    try {
      await ptApi.create({
        coachId: form.coachId,
        memberId: member.id,
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + Number(form.duration) * 60_000).toISOString(),
        price: Number(form.price.replace(',', '.')) || 0,
        notes: form.notes || null,
      });
      toast.success(t('Séance de coaching planifiée.'));
      setCreating(false);
      setMember(null);
      void queryClient.invalidateQueries({ queryKey: ['pt'] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <Card>
      <CardHeader
        title={t('Coaching privé')}
        description={t('Séances individuelles : elles alimentent les commissions des coachs dans la paie.')}
        actions={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            {t('Planifier une séance')}
          </Button>
        }
      />
      {sessions.isError && <ErrorNote message={errorMessage(sessions.error)} onRetry={() => sessions.refetch()} />}
      <DataTable
        rows={[...(sessions.data ?? [])].sort((a, b) => a.startsAt.localeCompare(b.startsAt))}
        rowKey={(s) => s.id}
        loading={sessions.isLoading}
        empty={<EmptyState title={t('Aucune séance de coaching')} />}
        columns={[
          { key: 'when', header: 'Quand', cell: (s) => formatDateTime(s.startsAt) },
          { key: 'member', header: 'Membre', cell: (s) => s.memberName },
          { key: 'coach', header: 'Coach', hideOnMobile: true, cell: (s) => s.coachName },
          { key: 'price', header: 'Prix', align: 'right', cell: (s) => formatTND(s.price) },
          { key: 'status', header: 'Statut', cell: (s) => <Badge tone={PT_STATUS[s.status].tone}>{t(PT_STATUS[s.status].label)}</Badge> },
          {
            key: 'actions',
            header: <span className="sr-only">{t('Actions')}</span>,
            align: 'right',
            cell: (s) =>
              s.status === 'SCHEDULED' && (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="secondary" onClick={() => void setStatus(s, 'DONE')}>
                    {t('Faite')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void setStatus(s, 'NO_SHOW')}>
                    {t('Absent')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void setStatus(s, 'CANCELLED')}>
                    {t('Annuler')}
                  </Button>
                </div>
              ),
          },
        ]}
      />
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t('Planifier une séance de coaching')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              {t('Annuler')}
            </Button>
            <Button disabled={!member || !form.coachId || !form.startsAt} onClick={() => void create()}>
              {t('Planifier')}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-[13px] font-medium text-fg-2">{t('Membre')}</p>
            <MemberPicker value={member} onChange={setMember} />
          </div>
          <Select label={t('Coach')} value={form.coachId} onChange={(e) => setForm((f) => ({ ...f, coachId: e.target.value }))}>
            <option value="">{t('Choisir…')}</option>
            {coaches.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {fullName(c)}
              </option>
            ))}
          </Select>
          <Input label={t('Début')} type="datetime-local" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
          <Input label={t('Durée (minutes)')} type="number" min={15} step={15} value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))} />
          <Input label={t('Prix (DT)')} type="number" min={0} step={0.001} value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
          <Textarea label={t('Notes')} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} wrapperClassName="sm:col-span-2" />
        </div>
      </Modal>
    </Card>
  );
}

export function TrainingPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabKey>('programs');
  return (
    <div>
      <PageHeader title={t('Entraînement')} description={t('Programmes, bibliothèque d’exercices, suivi physique et coaching privé.')} />
      <Tabs
        className="mb-5 w-fit"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'programs', label: 'Programmes' },
          { key: 'exercises', label: 'Exercices' },
          { key: 'measurements', label: 'Mensurations' },
          { key: 'pt', label: 'Coaching privé' },
        ]}
      />
      {tab === 'programs' && <ProgramsTab />}
      {tab === 'exercises' && <ExercisesTab />}
      {tab === 'measurements' && <MeasurementsTab />}
      {tab === 'pt' && <PtTab />}
    </div>
  );
}
