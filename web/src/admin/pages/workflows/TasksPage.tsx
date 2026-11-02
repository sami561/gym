import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { tasksApi } from '../../../api/endpoints-ops';
import { errorMessage } from '../../../api/client';
import { useAuth } from '../../../api/auth';
import type { Role } from '../../../api/types';
import type { TaskDto, TaskStatus } from '../../../api/types-ops';
import { Badge } from '../../../components/ui/Badge';
import { Button, IconButton } from '../../../components/ui/Button';
import { ErrorNote, PageHeader } from '../../../components/ui/Card';
import { Checkbox, Input, Select, Textarea } from '../../../components/ui/Field';
import { Modal, useConfirm } from '../../../components/ui/Modal';
import { Skeleton } from '../../../components/ui/Spinner';
import { useToast } from '../../../components/ui/Toast';
import { useI18n, type TKey } from '../../../i18n';
import { formatDateTime, relativeTime, ROLE_LABELS } from '../../../lib/format';
import { TASK_STATUS } from '../../../lib/labels-ops';
import { nextActions } from './RunDetailPage';

const COLUMNS: { key: 'BLOCKED' | 'TODO' | 'IN_PROGRESS' | 'DONE'; title: TKey; statuses: TaskStatus[] }[] = [
  { key: 'BLOCKED', title: 'Bloquée', statuses: ['BLOCKED'] },
  { key: 'TODO', title: 'À faire', statuses: ['TODO', 'FAILED'] },
  { key: 'IN_PROGRESS', title: 'En cours', statuses: ['IN_PROGRESS'] },
  { key: 'DONE', title: 'Terminée', statuses: ['DONE'] },
];

function CreateTaskModal({ open, onClose, openTasks }: { open: boolean; onClose: () => void; openTasks: TaskDto[] }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ title: '', description: '', assigneeRole: '', assigneeName: '', dueAt: '' });
  const [deps, setDeps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await tasksApi.create({
        title: form.title.trim(),
        description: form.description.trim() || null,
        assigneeRole: (form.assigneeRole || null) as Role | null,
        assigneeName: form.assigneeName.trim() || null,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
        dependsOn: deps,
      });
      toast.success(t('Tâche créée.'));
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setForm({ title: '', description: '', assigneeRole: '', assigneeName: '', dueAt: '' });
      setDeps([]);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Nouvelle tâche')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Annuler')}
          </Button>
          <Button loading={saving} disabled={!form.title.trim()} onClick={() => void save()}>
            {t('Créer la tâche')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t('Titre')} value={form.title} onChange={set('title')} wrapperClassName="sm:col-span-2" placeholder={t('Vérifier l’extincteur du plateau')} />
        <Textarea label={t('Description')} value={form.description} onChange={set('description')} wrapperClassName="sm:col-span-2" />
        <Select label={t('Rôle assigné')} value={form.assigneeRole} onChange={set('assigneeRole')}>
          <option value="">{t('Toute l’équipe')}</option>
          {(['ADMIN', 'STAFF', 'COACH'] as Role[]).map((r) => (
            <option key={r} value={r}>
              {t(ROLE_LABELS[r])}
            </option>
          ))}
        </Select>
        <Input label={t('Personne assignée')} value={form.assigneeName} onChange={set('assigneeName')} />
        <Input label={t('Échéance')} type="datetime-local" value={form.dueAt} onChange={set('dueAt')} />
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-fg-2">
            <Link2 className="size-3.5" aria-hidden />
            {t('Dépend de')}
          </legend>
          {openTasks.length === 0 ? (
            <p className="text-sm text-muted">{t('Aucune tâche ouverte à lier.')}</p>
          ) : (
            <div className="scroll-thin max-h-48 overflow-y-auto rounded-lg px-3 py-1 ring-1 ring-line">
              {openTasks.map((task) => (
                <Checkbox
                  key={task.id}
                  label={task.title}
                  description={task.runTitle ?? undefined}
                  checked={deps.includes(task.id)}
                  onChange={(checked) => setDeps((d) => (checked ? [...d, task.id] : d.filter((x) => x !== task.id)))}
                />
              ))}
            </div>
          )}
          <p className="mt-1.5 text-xs text-muted">{t('La tâche reste « Bloquée » tant que ces tâches ne sont pas terminées.')}</p>
        </fieldset>
        {error && (
          <div className="sm:col-span-2">
            <ErrorNote message={error} />
          </div>
        )}
      </div>
    </Modal>
  );
}

function TaskCard({ task, byId, onStatus, onRetry, onDelete }: { task: TaskDto; byId: Map<string, TaskDto>; onStatus: (s: TaskStatus) => void; onRetry: () => void; onDelete?: () => void }) {
  const { t } = useI18n();
  const blockers = task.dependsOn.map((id) => byId.get(id)).filter((d): d is TaskDto => Boolean(d) && d!.status !== 'DONE' && d!.status !== 'SKIPPED');
  return (
    <article className={clsx('rounded-lg bg-page p-3 ring-1', task.isOverdue ? 'ring-[#d03b3b]/50' : 'ring-line')}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm leading-snug font-semibold text-fg">{task.title}</p>
        {onDelete && (
          <IconButton label={t('Supprimer')} className="-me-1 -mt-1 size-7" onClick={onDelete}>
            <Trash2 className="size-3.5" />
          </IconButton>
        )}
      </div>
      {task.runTitle && task.runId && (
        <Link to={`/admin/workflows/runs/${task.runId}`} className="mt-0.5 block truncate text-xs text-fg-2 hover:underline">
          {task.runTitle}
        </Link>
      )}
      <p className="mt-1 text-xs text-muted">
        {[task.assigneeName, task.assigneeRole ? t(ROLE_LABELS[task.assigneeRole]) : null].filter(Boolean).join(', ') || t('Toute l’équipe')}
      </p>
      {blockers.length > 0 && <p className="mt-1.5 text-xs text-fg-2">{t('Attend : {list}', { list: blockers.map((b) => b.title).join(', ') })}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {task.status === 'FAILED' && <Badge tone="bad">{t(TASK_STATUS.FAILED.label)}</Badge>}
        {task.isOverdue && <Badge tone="bad">{t('En retard')}</Badge>}
        {task.dueAt && !task.isOverdue && task.status !== 'DONE' && <span className="text-xs text-muted" title={formatDateTime(task.dueAt)}>{t('Échéance {when}', { when: relativeTime(task.dueAt) })}</span>}
        {task.status === 'DONE' && task.completedAt && <span className="text-xs text-muted">{t('Terminée {when}', { when: relativeTime(task.completedAt) })}{task.completedByName ? `, ${task.completedByName}` : ''}</span>}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1">
        {task.status === 'FAILED' ? (
          <Button size="sm" variant="secondary" icon={<RotateCcw className="size-3.5" />} onClick={onRetry}>
            {t('Relancer')}
          </Button>
        ) : (
          task.type === 'MANUAL' &&
          nextActions(task.status).map((a) => (
            <Button key={a.status} size="sm" variant={a.status === 'DONE' ? 'secondary' : 'ghost'} onClick={() => onStatus(a.status)}>
              {t(a.label)}
            </Button>
          ))
        )}
      </div>
    </article>
  );
}

export function TasksPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [mine, setMine] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const open = useQuery({ queryKey: ['tasks', 'open', mine, overdueOnly], queryFn: () => tasksApi.list({ status: 'OPEN', mine, overdueOnly }), refetchInterval: 30_000 });
  const failed = useQuery({ queryKey: ['tasks', 'failed', mine], queryFn: () => tasksApi.list({ status: 'FAILED', mine }) });
  const done = useQuery({ queryKey: ['tasks', 'done', mine], queryFn: () => tasksApi.list({ status: 'DONE', mine }), enabled: !overdueOnly });

  const all = [...(open.data ?? []), ...(failed.data ?? []).filter((f) => !(open.data ?? []).some((o) => o.id === f.id)), ...(done.data ?? [])];
  const byId = new Map(all.map((task) => [task.id, task]));
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['tasks'] });

  const setStatus = async (task: TaskDto, status: TaskStatus) => {
    try {
      await tasksApi.update(task.id, { status });
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        title={t('Tâches')}
        description={t('Les tâches des workflows et les tâches ponctuelles, de « Bloquée » à « Terminée ».')}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            {t('Nouvelle tâche')}
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant={mine ? 'primary' : 'secondary'} size="sm" aria-pressed={mine} onClick={() => setMine((v) => !v)}>
          {t('Mes tâches')}
        </Button>
        <Button variant={overdueOnly ? 'primary' : 'secondary'} size="sm" aria-pressed={overdueOnly} onClick={() => setOverdueOnly((v) => !v)}>
          {t('En retard')}
        </Button>
      </div>
      {open.isError && <ErrorNote message={errorMessage(open.error)} onRetry={() => open.refetch()} />}
      <div className="scroll-thin overflow-x-auto pb-2">
        <div className="grid min-w-[980px] grid-cols-4 gap-3">
          {COLUMNS.map((col) => {
            let items = all.filter((task) => col.statuses.includes(task.status));
            if (col.key === 'DONE') items = items.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')).slice(0, 20);
            else items = items.sort((a, b) => Number(b.isOverdue) - Number(a.isOverdue) || (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'));
            return (
              <section key={col.key} aria-label={t(col.title)} className="flex min-h-[420px] flex-col rounded-xl bg-card ring-1 ring-line">
                <header className="flex items-center justify-between border-b border-line px-3 py-2.5">
                  <h2 className="text-sm font-semibold text-fg">{t(col.title)}</h2>
                  <span className="rounded-full bg-card-2 px-2 text-xs text-fg-2 tabular">{items.length}</span>
                </header>
                <div className="flex flex-1 flex-col gap-2 p-2">
                  {open.isLoading && <Skeleton className="h-24" />}
                  {items.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      byId={byId}
                      onStatus={(s) => void setStatus(task, s)}
                      onRetry={async () => {
                        try {
                          await tasksApi.retry(task.id);
                          refresh();
                        } catch (err) {
                          toast.error(errorMessage(err));
                        }
                      }}
                      onDelete={
                        user?.role === 'ADMIN' && !task.runId
                          ? async () => {
                              if (!(await confirm({ title: t('Supprimer la tâche « {title} » ?', { title: task.title }), confirmLabel: t('Supprimer'), danger: true }))) return;
                              try {
                                await tasksApi.remove(task.id);
                                refresh();
                              } catch (err) {
                                toast.error(errorMessage(err));
                              }
                            }
                          : undefined
                      }
                    />
                  ))}
                  {!open.isLoading && items.length === 0 && <p className="px-1 py-2 text-xs text-muted">{t('Rien ici')}</p>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <CreateTaskModal open={creating} onClose={() => setCreating(false)} openTasks={(open.data ?? []).filter((task) => task.status !== 'DONE')} />
    </div>
  );
}
