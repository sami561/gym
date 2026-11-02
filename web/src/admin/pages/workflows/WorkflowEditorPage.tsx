import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addEdge,
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, LayoutGrid, Play, Plus, Save, Trash2, Unlink } from 'lucide-react';
import { workflowsApi } from '../../../api/endpoints-ops';
import { errorMessage } from '../../../api/client';
import { useAuth } from '../../../api/auth';
import type { Role } from '../../../api/types';
import type { CreateWorkflowBody, TaskType, WorkflowTaskDef, WorkflowTrigger, WorkflowTriggerType } from '../../../api/types-ops';
import { Button } from '../../../components/ui/Button';
import { Card, ErrorNote } from '../../../components/ui/Card';
import { Checkbox, Input, Select, Textarea } from '../../../components/ui/Field';
import { Modal } from '../../../components/ui/Modal';
import { PageSpinner } from '../../../components/ui/Spinner';
import { useToast } from '../../../components/ui/Toast';
import { useI18n } from '../../../i18n';
import { ROLE_LABELS } from '../../../lib/format';
import { CRON_PRESETS, EVENT_LABELS, TASK_TYPE_LABELS, TRIGGER_TYPE_LABELS } from '../../../lib/labels-ops';
import { useThemeMode } from '../../../lib/theme';
import { autoLayout, createsCycle, newTaskId } from './graph';
import { nodeTypes, type TaskFlowNode, type TaskNodeData } from './TaskNode';

type EditorData = TaskNodeData & { description?: string | null; automationUrl?: string; automationMethod?: 'POST' | 'GET' };
type EditorNode = TaskFlowNode & { data: EditorData };

const EDGE_STYLE = { markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 }, style: { strokeWidth: 2 } };
const FALLBACK_EVENTS = Object.keys(EVENT_LABELS);
const FALLBACK_ROLES: Role[] = ['ADMIN', 'STAFF', 'COACH'];

function toNodes(tasks: WorkflowTaskDef[]): EditorNode[] {
  const layout = autoLayout(tasks);
  return tasks.map((task) => ({
    id: task.id,
    type: 'task',
    position: task.position ?? layout.get(task.id) ?? { x: 0, y: 0 },
    data: {
      title: task.title,
      description: task.description ?? null,
      type: task.type,
      assigneeRole: task.assigneeRole ?? null,
      assigneeName: task.assigneeName ?? null,
      dueInHours: task.dueInHours ?? null,
      automationUrl: task.automation?.url ?? '',
      automationMethod: task.automation?.method ?? 'POST',
    },
  }));
}

function toEdges(tasks: WorkflowTaskDef[]): Edge[] {
  return tasks.flatMap((task) => task.dependsOn.map((dep) => ({ id: `${dep}->${task.id}`, source: dep, target: task.id, ...EDGE_STYLE })));
}

function Editor() {
  const { id } = useParams();
  const isNew = !id;
  const { t } = useI18n();
  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const theme = useThemeMode();
  const flow = useReactFlow();

  const workflow = useQuery({ queryKey: ['workflow', id], queryFn: () => workflowsApi.get(id!), enabled: !isNew });
  const meta = useQuery({ queryKey: ['workflow-meta'], queryFn: workflowsApi.meta });
  const events = meta.data?.events ?? FALLBACK_EVENTS;
  const roles = (meta.data?.roles ?? FALLBACK_ROLES).filter((r) => r !== 'MEMBER');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [titleTemplate, setTitleTemplate] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [trigger, setTrigger] = useState<WorkflowTrigger>({ type: 'MANUAL', event: null, cron: null });
  const [nodes, setNodes, onNodesChange] = useNodesState<EditorNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [runTitle, setRunTitle] = useState('');

  useEffect(() => {
    if (isNew) {
      const first = newTaskId();
      setNodes(toNodes([{ id: first, title: t('Première tâche'), type: 'MANUAL', dependsOn: [] }]));
      setEdges([]);
      return;
    }
    const w = workflow.data;
    if (!w) return;
    setName(w.name);
    setDescription(w.description ?? '');
    setTitleTemplate(w.titleTemplate ?? '');
    setIsActive(w.isActive);
    setTrigger(w.trigger);
    setNodes(toNodes(w.tasks));
    setEdges(toEdges(w.tasks));
    // Load once per workflow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow.data, isNew]);

  const dependsOn = useMemo(() => {
    const map = new Map<string, string[]>();
    edges.forEach((e) => map.set(e.target, [...(map.get(e.target) ?? []), e.source]));
    return map;
  }, [edges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (createsCycle(dependsOn, connection.source, connection.target)) {
        toast.error(t('Ce lien créerait une boucle : une tâche ne peut pas dépendre d’elle-même.'));
        return;
      }
      setEdges((eds) => addEdge({ ...connection, id: `${connection.source}->${connection.target}`, ...EDGE_STYLE }, eds));
    },
    [dependsOn, setEdges, toast, t],
  );

  const node = nodes.find((n) => n.id === selectedNode) ?? null;
  const updateNode = (patch: Partial<EditorData>) =>
    setNodes((list) => list.map((n) => (n.id === selectedNode ? { ...n, data: { ...n.data, ...patch } } : n)));

  const addTask = () => {
    const taskId = newTaskId();
    const center = flow.screenToFlowPosition({ x: window.innerWidth / 2 - 200, y: window.innerHeight / 2 });
    setNodes((list) => [...list, { id: taskId, type: 'task', position: center, data: { title: t('Nouvelle tâche'), type: 'MANUAL', automationMethod: 'POST' } }]);
    setSelectedNode(taskId);
    setSelectedEdge(null);
  };

  const relayout = () => {
    const positions = autoLayout(nodes.map((n) => ({ id: n.id, dependsOn: dependsOn.get(n.id) ?? [] })));
    setNodes((list) => list.map((n) => ({ ...n, position: positions.get(n.id) ?? n.position })));
    window.setTimeout(() => void flow.fitView({ padding: 0.2, duration: 300 }), 50);
  };

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError(t('Donnez un nom au workflow.'));
    if (!nodes.length) return setError(t('Ajoutez au moins une tâche.'));
    const untitled = nodes.find((n) => !n.data.title.trim());
    if (untitled) return setError(t('Chaque tâche doit avoir un titre.'));
    const missingUrl = nodes.find((n) => n.data.type === 'AUTOMATION' && !n.data.automationUrl?.trim());
    if (missingUrl) return setError(t('La tâche automatique « {title} » n’a pas d’URL de webhook.', { title: missingUrl.data.title }));
    if (trigger.type === 'EVENT' && !trigger.event) return setError(t('Choisissez l’événement déclencheur.'));
    if (trigger.type === 'SCHEDULE' && !trigger.cron) return setError(t('Choisissez la planification.'));

    const body: CreateWorkflowBody = {
      name: name.trim(),
      description: description.trim() || null,
      titleTemplate: titleTemplate.trim() || null,
      isActive,
      trigger: { type: trigger.type, event: trigger.type === 'EVENT' ? trigger.event : null, cron: trigger.type === 'SCHEDULE' ? trigger.cron : null },
      tasks: nodes.map((n) => ({
        id: n.id,
        title: n.data.title.trim(),
        description: n.data.description ?? null,
        type: n.data.type,
        assigneeRole: n.data.assigneeRole ?? null,
        assigneeName: n.data.assigneeName ?? null,
        dueInHours: n.data.dueInHours ?? null,
        dependsOn: dependsOn.get(n.id) ?? [],
        automation: n.data.type === 'AUTOMATION' ? { kind: 'WEBHOOK', url: n.data.automationUrl!.trim(), method: n.data.automationMethod ?? 'POST' } : null,
        position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      })),
    };
    setSaving(true);
    try {
      if (isNew) {
        const created = await workflowsApi.create(body);
        toast.success(t('Workflow créé.'));
        void queryClient.invalidateQueries({ queryKey: ['workflows'] });
        navigate(`/admin/workflows/${created.id}`, { replace: true });
      } else {
        await workflowsApi.update(id!, body);
        toast.success(t('Workflow enregistré.'));
        void queryClient.invalidateQueries({ queryKey: ['workflows'] });
        void queryClient.invalidateQueries({ queryKey: ['workflow', id] });
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const start = async () => {
    try {
      const run = await workflowsApi.start(id!, { title: runTitle.trim() || undefined });
      toast.success(t('Exécution démarrée.'));
      void queryClient.invalidateQueries({ queryKey: ['runs'] });
      navigate(`/admin/workflows/runs/${run.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (!isNew && workflow.isLoading) return <PageSpinner />;
  if (!isNew && workflow.isError) return <ErrorNote message={errorMessage(workflow.error)} onRetry={() => workflow.refetch()} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/admin/workflows" className="inline-flex items-center gap-1.5 text-sm text-fg-2 hover:text-fg">
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
          {t('Workflows')}
        </Link>
        <h1 className="type-wide text-2xl text-fg">{isNew ? t('Nouveau workflow') : name || t('Workflow')}</h1>
        <div className="ms-auto flex flex-wrap gap-2">
          {canEdit && (
            <>
              <Button variant="secondary" icon={<Plus className="size-4" />} onClick={addTask}>
                {t('Ajouter une tâche')}
              </Button>
              <Button variant="secondary" icon={<LayoutGrid className="size-4" />} onClick={relayout}>
                {t('Organiser')}
              </Button>
            </>
          )}
          {!isNew && (
            <Button variant="secondary" icon={<Play className="size-4" />} onClick={() => setStarting(true)}>
              {t('Démarrer')}
            </Button>
          )}
          {canEdit && (
            <Button icon={<Save className="size-4" />} loading={saving} onClick={() => void save()}>
              {t('Enregistrer')}
            </Button>
          )}
        </div>
      </div>
      {error && <ErrorNote message={error} />}

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="h-[calc(100dvh-230px)] min-h-[480px] overflow-hidden" dir="ltr">
          <ReactFlow<EditorNode, Edge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => {
              setSelectedNode(n.id);
              setSelectedEdge(null);
            }}
            onEdgeClick={(_, e) => {
              setSelectedEdge(e.id);
              setSelectedNode(null);
            }}
            onPaneClick={() => {
              setSelectedNode(null);
              setSelectedEdge(null);
            }}
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            deleteKeyCode={canEdit ? ['Backspace', 'Delete'] : null}
            colorMode={theme}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} />
            <MiniMap pannable zoomable className="!hidden sm:!block" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </Card>

        <Card className="scroll-thin flex max-h-[calc(100dvh-230px)] flex-col gap-5 overflow-y-auto p-5">
          {node ? (
            <fieldset disabled={!canEdit} className="flex flex-col gap-4">
              <legend className="mb-1 text-[15px] font-semibold text-fg">{t('Tâche')}</legend>
              <Input label={t('Titre')} value={node.data.title} onChange={(e) => updateNode({ title: e.target.value })} />
              <Textarea label={t('Description')} value={node.data.description ?? ''} onChange={(e) => updateNode({ description: e.target.value || null })} />
              <Select label={t('Type')} value={node.data.type} onChange={(e) => updateNode({ type: e.target.value as TaskType })}>
                {(Object.keys(TASK_TYPE_LABELS) as TaskType[]).map((type) => (
                  <option key={type} value={type}>
                    {t(TASK_TYPE_LABELS[type])}
                  </option>
                ))}
              </Select>
              {node.data.type === 'AUTOMATION' ? (
                <>
                  <Input
                    label={t('URL du webhook (n8n…)')}
                    value={node.data.automationUrl ?? ''}
                    onChange={(e) => updateNode({ automationUrl: e.target.value })}
                    placeholder="https://n8n.example.tn/webhook/onboarding"
                    hint={t('Les {{variables}} sont remplies avec le contexte de l’exécution.')}
                  />
                  <Select label={t('Méthode')} value={node.data.automationMethod ?? 'POST'} onChange={(e) => updateNode({ automationMethod: e.target.value as 'POST' | 'GET' })}>
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                  </Select>
                </>
              ) : (
                <>
                  <Select label={t('Rôle assigné')} value={node.data.assigneeRole ?? ''} onChange={(e) => updateNode({ assigneeRole: (e.target.value || null) as Role | null })}>
                    <option value="">{t('Toute l’équipe')}</option>
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {t(ROLE_LABELS[r])}
                      </option>
                    ))}
                  </Select>
                  <Input label={t('Personne assignée')} value={node.data.assigneeName ?? ''} onChange={(e) => updateNode({ assigneeName: e.target.value || null })} />
                </>
              )}
              <Input
                label={t('Délai (heures)')}
                type="number"
                min={0}
                value={node.data.dueInHours ?? ''}
                onChange={(e) => updateNode({ dueInHours: e.target.value === '' ? null : Number(e.target.value) })}
                hint={t('Compté à partir du moment où la tâche devient « À faire ».')}
              />
              <p className="text-xs text-muted">
                {t('Dépend de : {list}', {
                  list: (dependsOn.get(node.id) ?? []).map((dep) => nodes.find((n) => n.id === dep)?.data.title ?? dep).join(', ') || t('aucune tâche'),
                })}
              </p>
              {canEdit && (
                <Button
                  variant="danger"
                  icon={<Trash2 className="size-4" />}
                  onClick={() => {
                    setNodes((list) => list.filter((n) => n.id !== node.id));
                    setEdges((list) => list.filter((e) => e.source !== node.id && e.target !== node.id));
                    setSelectedNode(null);
                  }}
                >
                  {t('Supprimer la tâche')}
                </Button>
              )}
            </fieldset>
          ) : selectedEdge ? (
            <div className="flex flex-col gap-3">
              <p className="text-[15px] font-semibold text-fg">{t('Lien de dépendance')}</p>
              <p className="text-sm text-fg-2">
                {(() => {
                  const e = edges.find((x) => x.id === selectedEdge);
                  const from = nodes.find((n) => n.id === e?.source)?.data.title ?? '';
                  const to = nodes.find((n) => n.id === e?.target)?.data.title ?? '';
                  return t('« {to} » commence quand « {from} » est terminée.', { from, to });
                })()}
              </p>
              {canEdit && (
                <Button
                  variant="danger"
                  icon={<Unlink className="size-4" />}
                  onClick={() => {
                    setEdges((list) => list.filter((e) => e.id !== selectedEdge));
                    setSelectedEdge(null);
                  }}
                >
                  {t('Supprimer ce lien')}
                </Button>
              )}
            </div>
          ) : (
            <fieldset disabled={!canEdit} className="flex flex-col gap-4">
              <legend className="mb-1 text-[15px] font-semibold text-fg">{t('Workflow')}</legend>
              <Input label={t('Nom')} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Accueil d’un nouveau membre')} />
              <Textarea label={t('Description')} value={description} onChange={(e) => setDescription(e.target.value)} />
              <Input
                label={t('Titre des exécutions')}
                value={titleTemplate}
                onChange={(e) => setTitleTemplate(e.target.value)}
                placeholder="Onboarding {{firstName}} {{lastName}}"
                hint={t('Les {{variables}} viennent de l’événement déclencheur.')}
              />
              <Select label={t('Déclencheur')} value={trigger.type} onChange={(e) => setTrigger({ type: e.target.value as WorkflowTriggerType, event: null, cron: null })}>
                {(Object.keys(TRIGGER_TYPE_LABELS) as WorkflowTriggerType[]).map((type) => (
                  <option key={type} value={type}>
                    {t(TRIGGER_TYPE_LABELS[type])}
                  </option>
                ))}
              </Select>
              {trigger.type === 'EVENT' && (
                <Select label={t('Événement')} value={trigger.event ?? ''} onChange={(e) => setTrigger({ ...trigger, event: e.target.value || null })}>
                  <option value="">{t('Choisir…')}</option>
                  {events.map((ev) => (
                    <option key={ev} value={ev}>
                      {EVENT_LABELS[ev] ? t(EVENT_LABELS[ev]) : ev}
                    </option>
                  ))}
                </Select>
              )}
              {trigger.type === 'SCHEDULE' && (
                <>
                  <Select
                    label={t('Planification')}
                    value={CRON_PRESETS.some((p) => p.cron === trigger.cron) ? trigger.cron ?? '' : trigger.cron ? 'custom' : ''}
                    onChange={(e) => setTrigger({ ...trigger, cron: e.target.value === 'custom' ? trigger.cron ?? '0 9 * * *' : e.target.value || null })}
                  >
                    <option value="">{t('Choisir…')}</option>
                    {CRON_PRESETS.map((p) => (
                      <option key={p.cron} value={p.cron}>
                        {t(p.label)}
                      </option>
                    ))}
                    <option value="custom">{t('Expression cron personnalisée')}</option>
                  </Select>
                  {!CRON_PRESETS.some((p) => p.cron === trigger.cron) && (
                    <Input label={t('Expression cron')} value={trigger.cron ?? ''} onChange={(e) => setTrigger({ ...trigger, cron: e.target.value })} placeholder="45 5 * * 1-6" hint={t('Minute, heure, jour du mois, mois, jour de la semaine (heure de Tunis).')} />
                  )}
                </>
              )}
              <Checkbox label={t('Workflow actif')} checked={isActive} onChange={setIsActive} description={t('Inactif : il ne démarre plus automatiquement.')} />
              <p className="rounded-lg bg-page p-3 text-xs text-fg-2 ring-1 ring-line">
                {t('Glissez du point rouge d’une tâche vers une autre pour créer une dépendance. Sélectionnez un lien ou une tâche puis appuyez sur Suppr pour l’effacer.')}
              </p>
            </fieldset>
          )}
        </Card>
      </div>

      <Modal
        open={starting}
        onClose={() => setStarting(false)}
        title={t('Démarrer le workflow')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setStarting(false)}>
              {t('Annuler')}
            </Button>
            <Button icon={<Play className="size-4" />} onClick={() => void start()}>
              {t('Démarrer')}
            </Button>
          </>
        }
      >
        <Input label={t('Titre de l’exécution')} value={runTitle} onChange={(e) => setRunTitle(e.target.value)} placeholder={name} hint={t('Facultatif')} />
      </Modal>
    </div>
  );
}

export function WorkflowEditorPage() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
