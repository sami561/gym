import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Play, Plus, Trash2, Workflow, Zap } from 'lucide-react';
import { runsApi, workflowsApi } from '../../../api/endpoints-ops';
import { errorMessage } from '../../../api/client';
import { useAuth } from '../../../api/auth';
import type { WorkflowDto, WorkflowRunStatus } from '../../../api/types-ops';
import { Badge } from '../../../components/ui/Badge';
import { Button, IconButton } from '../../../components/ui/Button';
import { Card, EmptyState, ErrorNote, PageHeader } from '../../../components/ui/Card';
import { DataTable } from '../../../components/ui/DataTable';
import { useConfirm } from '../../../components/ui/Modal';
import { Skeleton } from '../../../components/ui/Spinner';
import { Tabs } from '../../../components/ui/Tabs';
import { useToast } from '../../../components/ui/Toast';
import { useI18n } from '../../../i18n';
import { formatDateTime, formatInt } from '../../../lib/format';
import { cronLabel, EVENT_LABELS, RUN_STATUS } from '../../../lib/labels-ops';

type TabKey = 'templates' | 'runs';

function TriggerLine({ workflow }: { workflow: WorkflowDto }) {
  const { t } = useI18n();
  const { trigger } = workflow;
  if (trigger.type === 'EVENT')
    return (
      <span className="inline-flex items-center gap-1.5">
        <Zap className="size-3.5" aria-hidden />
        {trigger.event && EVENT_LABELS[trigger.event] ? t(EVENT_LABELS[trigger.event]) : trigger.event}
      </span>
    );
  if (trigger.type === 'SCHEDULE')
    return (
      <span className="inline-flex items-center gap-1.5">
        <Clock className="size-3.5" aria-hidden />
        {cronLabel(trigger.cron, t)}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5">
      <Play className="size-3.5" aria-hidden />
      {t('Démarrage manuel')}
    </span>
  );
}

export function Progress({ done, total }: { done: number; total: number }) {
  const { t } = useI18n();
  const ratio = total ? done / total : 0;
  return (
    <div className="flex min-w-[140px] items-center gap-2" title={t('{done} tâches terminées sur {total}', { done, total })}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-card-2" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className="text-xs text-fg-2 tabular">
        {done}/{total}
      </span>
    </div>
  );
}

function TemplatesTab() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const workflows = useQuery({ queryKey: ['workflows'], queryFn: workflowsApi.list });

  const start = async (w: WorkflowDto) => {
    try {
      const run = await workflowsApi.start(w.id);
      toast.success(t('Exécution démarrée.'));
      void queryClient.invalidateQueries({ queryKey: ['runs'] });
      navigate(`/admin/workflows/runs/${run.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (workflows.isError) return <ErrorNote message={errorMessage(workflows.error)} onRetry={() => workflows.refetch()} />;
  if (workflows.isLoading) return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>;
  if (!workflows.data?.length)
    return (
      <Card>
        <EmptyState
          icon={<Workflow className="size-8" />}
          title={t('Aucun workflow')}
          description={t('Enchaînez des tâches liées : accueil d’un nouveau membre, ouverture de la salle, relance des abonnements expirés…')}
          action={
            user?.role === 'ADMIN' && (
              <Button icon={<Plus className="size-4" />} onClick={() => navigate('/admin/workflows/nouveau')}>
                {t('Créer un workflow')}
              </Button>
            )
          }
        />
      </Card>
    );

  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {workflows.data.map((w) => (
        <li key={w.id}>
          <Card className="flex h-full flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <Link to={`/admin/workflows/${w.id}`} className="min-w-0 hover:underline">
                <h2 className="truncate text-base font-semibold text-fg">{w.name}</h2>
              </Link>
              {w.isActive ? <Badge tone="good">{t('Actif')}</Badge> : <Badge>{t('Inactif')}</Badge>}
            </div>
            {w.description && <p className="line-clamp-2 text-sm text-fg-2">{w.description}</p>}
            <p className="text-sm text-fg-2">
              <TriggerLine workflow={w} />
            </p>
            <p className="text-xs text-muted">{t('{tasks} tâches, {runs} exécutions', { tasks: formatInt(w.tasks.length), runs: formatInt(w.runCount) })}</p>
            <div className="mt-auto flex flex-wrap gap-2 pt-2">
              <Button size="sm" icon={<Play className="size-3.5" />} onClick={() => void start(w)}>
                {t('Démarrer')}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => navigate(`/admin/workflows/${w.id}`)}>
                {user?.role === 'ADMIN' ? t('Modifier') : t('Voir')}
              </Button>
              {user?.role === 'ADMIN' && (
                <IconButton
                  label={t('Supprimer')}
                  className="ms-auto"
                  onClick={async () => {
                    if (!(await confirm({ title: t('Supprimer le workflow {name} ?', { name: w.name }), message: t('Les exécutions passées sont conservées.'), confirmLabel: t('Supprimer'), danger: true }))) return;
                    try {
                      await workflowsApi.remove(w.id);
                      void queryClient.invalidateQueries({ queryKey: ['workflows'] });
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              )}
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function RunsTab() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [status, setStatus] = useState<WorkflowRunStatus | ''>('RUNNING');
  const runs = useQuery({ queryKey: ['runs', status], queryFn: () => runsApi.list({ status, limit: 100 }), refetchInterval: 20_000 });
  return (
    <Card>
      <div className="px-5 pt-4">
        <Tabs
          value={status}
          onChange={setStatus}
          items={[
            { key: 'RUNNING', label: 'En cours' },
            { key: 'COMPLETED', label: 'Terminées' },
            { key: 'CANCELLED', label: 'Annulées' },
            { key: '', label: 'Toutes' },
          ]}
        />
      </div>
      {runs.isError && <ErrorNote message={errorMessage(runs.error)} onRetry={() => runs.refetch()} />}
      <DataTable
        rows={runs.data}
        rowKey={(r) => r.id}
        loading={runs.isLoading}
        onRowClick={(r) => navigate(`/admin/workflows/runs/${r.id}`)}
        empty={<EmptyState title={t('Aucune exécution')} />}
        columns={[
          { key: 'title', header: 'Exécution', cell: (r) => <div><p className="font-medium">{r.title}</p><p className="text-xs text-muted">{r.workflowName}</p></div> },
          { key: 'started', header: 'Démarrée', hideOnMobile: true, cell: (r) => `${formatDateTime(r.startedAt)}${r.startedByName ? `, ${r.startedByName}` : ''}` },
          { key: 'progress', header: 'Avancement', cell: (r) => <Progress done={r.progress.done} total={r.progress.total} /> },
          { key: 'status', header: 'Statut', cell: (r) => <Badge tone={RUN_STATUS[r.status].tone}>{t(RUN_STATUS[r.status].label)}</Badge> },
        ]}
      />
    </Card>
  );
}

export function WorkflowsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('templates');
  return (
    <div>
      <PageHeader
        title={t('Workflows')}
        description={t('Des tâches liées entre elles, démarrées à la main, par un événement ou selon un horaire.')}
        actions={
          user?.role === 'ADMIN' && (
            <Button icon={<Plus className="size-4" />} onClick={() => navigate('/admin/workflows/nouveau')}>
              {t('Nouveau workflow')}
            </Button>
          )
        }
      />
      <Tabs
        className="mb-5 w-fit"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'templates', label: 'Modèles' },
          { key: 'runs', label: 'Exécutions' },
        ]}
      />
      {tab === 'templates' ? <TemplatesTab /> : <RunsTab />}
    </div>
  );
}
