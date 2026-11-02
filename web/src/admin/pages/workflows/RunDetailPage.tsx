import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Background, Controls, MarkerType, ReactFlow, ReactFlowProvider, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Ban, RotateCcw } from 'lucide-react';
import { runsApi, tasksApi } from '../../../api/endpoints-ops';
import { errorMessage } from '../../../api/client';
import type { TaskDto, TaskStatus } from '../../../api/types-ops';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader, ErrorNote } from '../../../components/ui/Card';
import { useConfirm } from '../../../components/ui/Modal';
import { PageSpinner } from '../../../components/ui/Spinner';
import { useToast } from '../../../components/ui/Toast';
import { useI18n } from '../../../i18n';
import { formatDateTime, ROLE_LABELS } from '../../../lib/format';
import { RUN_STATUS, TASK_STATUS } from '../../../lib/labels-ops';
import { useThemeMode } from '../../../lib/theme';
import { autoLayout } from './graph';
import { nodeTypes, type TaskFlowNode } from './TaskNode';
import { Progress } from './WorkflowsPage';

/** Quick actions offered for a task in a given status. */
export function nextActions(status: TaskStatus): { status: TaskStatus; label: 'Commencer' | 'Terminer' | 'Ignorer' | 'Rouvrir' }[] {
  switch (status) {
    case 'TODO':
      return [
        { status: 'IN_PROGRESS', label: 'Commencer' },
        { status: 'DONE', label: 'Terminer' },
        { status: 'SKIPPED', label: 'Ignorer' },
      ];
    case 'IN_PROGRESS':
      return [
        { status: 'DONE', label: 'Terminer' },
        { status: 'SKIPPED', label: 'Ignorer' },
      ];
    case 'DONE':
    case 'SKIPPED':
      return [{ status: 'TODO', label: 'Rouvrir' }];
    default:
      return [];
  }
}

function RunGraph({ tasks }: { tasks: TaskDto[] }) {
  const theme = useThemeMode();
  const { nodes, edges } = useMemo(() => {
    const byDef = new Map(tasks.map((task) => [task.id, task]));
    const layout = autoLayout(tasks.map((task) => ({ id: task.id, dependsOn: task.dependsOn.filter((d) => byDef.has(d)) })));
    const nodes: TaskFlowNode[] = tasks.map((task) => ({
      id: task.id,
      type: 'task',
      position: layout.get(task.id) ?? { x: 0, y: 0 },
      draggable: false,
      data: { title: task.title, type: task.type, assigneeRole: task.assigneeRole, assigneeName: task.assigneeName, status: task.status, overdue: task.isOverdue },
    }));
    const edges: Edge[] = tasks.flatMap((task) =>
      task.dependsOn
        .filter((d) => byDef.has(d))
        .map((dep) => ({ id: `${dep}->${task.id}`, source: dep, target: task.id, markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2 }, animated: byDef.get(dep)?.status === 'IN_PROGRESS' })),
    );
    return { nodes, edges };
  }, [tasks]);
  return (
    <Card className="h-[420px] overflow-hidden" dir="ltr">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} nodesConnectable={false} nodesDraggable={false} colorMode={theme} fitView fitViewOptions={{ padding: 0.2 }} proOptions={{ hideAttribution: true }}>
        <Background gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </Card>
  );
}

export function RunDetailPage() {
  const { runId = '' } = useParams();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const run = useQuery({ queryKey: ['run', runId], queryFn: () => runsApi.get(runId), refetchInterval: 15_000 });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['run', runId] });
    void queryClient.invalidateQueries({ queryKey: ['runs'] });
    void queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };
  const setStatus = async (task: TaskDto, status: TaskStatus) => {
    try {
      await tasksApi.update(task.id, { status });
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (run.isLoading) return <PageSpinner />;
  if (run.isError || !run.data) return <ErrorNote message={run.error ? errorMessage(run.error) : t('Exécution introuvable.')} onRetry={() => run.refetch()} />;
  const r = run.data;
  const tasks = r.tasks ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link to="/admin/workflows" className="inline-flex items-center gap-1.5 text-sm text-fg-2 hover:text-fg">
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
          {t('Workflows')}
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="type-wide text-2xl text-fg">{r.title}</h1>
            <p className="mt-1 text-sm text-fg-2">
              {t('{workflow}, démarré le {date}', { workflow: r.workflowName, date: formatDateTime(r.startedAt) })}
              {r.startedByName ? `, ${r.startedByName}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone={RUN_STATUS[r.status].tone}>{t(RUN_STATUS[r.status].label)}</Badge>
            <Progress done={r.progress.done} total={r.progress.total} />
            {r.status === 'RUNNING' && (
              <Button
                variant="danger"
                size="sm"
                icon={<Ban className="size-4" />}
                onClick={async () => {
                  if (!(await confirm({ title: t('Annuler cette exécution ?'), message: t('Les tâches restantes ne seront plus proposées.'), confirmLabel: t('Annuler l’exécution'), danger: true }))) return;
                  try {
                    await runsApi.cancel(r.id);
                    refresh();
                  } catch (err) {
                    toast.error(errorMessage(err));
                  }
                }}
              >
                {t('Annuler l’exécution')}
              </Button>
            )}
          </div>
        </div>
      </div>

      <ReactFlowProvider>
        <RunGraph tasks={tasks} />
      </ReactFlowProvider>

      <Card>
        <CardHeader title={t('Tâches')} />
        <ul className="divide-y divide-line">
          {tasks.map((task) => (
            <li key={task.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-fg">{task.title}</p>
                <p className="text-xs text-muted">
                  {[task.assigneeName, task.assigneeRole ? t(ROLE_LABELS[task.assigneeRole]) : null, task.dueAt ? t('échéance {date}', { date: formatDateTime(task.dueAt) }) : null]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                {task.output && <p className="mt-1 text-xs break-all text-fg-2">{task.output}</p>}
              </div>
              {task.isOverdue && <Badge tone="bad">{t('En retard')}</Badge>}
              <Badge tone={TASK_STATUS[task.status].tone}>{t(TASK_STATUS[task.status].label)}</Badge>
              {r.status === 'RUNNING' && (
                <div className="flex gap-1">
                  {task.status === 'FAILED' && (
                    <Button size="sm" variant="secondary" icon={<RotateCcw className="size-3.5" />} onClick={async () => {
                      try {
                        await tasksApi.retry(task.id);
                        refresh();
                      } catch (err) {
                        toast.error(errorMessage(err));
                      }
                    }}>
                      {t('Relancer')}
                    </Button>
                  )}
                  {task.type === 'MANUAL' &&
                    nextActions(task.status).map((a) => (
                      <Button key={a.status} size="sm" variant={a.status === 'DONE' ? 'secondary' : 'ghost'} onClick={() => void setStatus(task, a.status)}>
                        {t(a.label)}
                      </Button>
                    ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
