import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Bot, Hand } from 'lucide-react';
import clsx from 'clsx';
import type { Role } from '../../../api/types';
import type { TaskStatus, TaskType } from '../../../api/types-ops';
import { useI18n } from '../../../i18n';
import { ROLE_LABELS } from '../../../lib/format';
import { TASK_STATUS, TASK_TYPE_LABELS } from '../../../lib/labels-ops';
import { NODE_WIDTH, STATUS_STYLE } from './graph';

export type TaskNodeData = {
  title: string;
  type: TaskType;
  assigneeRole?: Role | null;
  assigneeName?: string | null;
  dueInHours?: number | null;
  status?: TaskStatus;
  overdue?: boolean;
};

export type TaskFlowNode = Node<TaskNodeData, 'task'>;

/** A task card on the canvas: drag from the right handle to another task to create a dependency. */
export function TaskNode({ data, selected }: NodeProps<TaskFlowNode>) {
  const { t } = useI18n();
  const status = data.status ? STATUS_STYLE[data.status] : null;
  const Icon = data.type === 'AUTOMATION' ? Bot : Hand;
  return (
    <div
      style={{ width: NODE_WIDTH }}
      className={clsx(
        'rounded-xl bg-card px-3.5 py-3 text-start shadow-sm ring-1',
        status ? `${status.ring} ring-2` : 'ring-line',
        selected && 'outline-2 outline-offset-2 outline-brand-500',
      )}
    >
      <Handle type="target" position={Position.Left} className="!size-3 !border-2 !border-card !bg-fg-2" />
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
        <p className="line-clamp-2 text-sm leading-snug font-semibold text-fg">{data.title || t('Tâche sans titre')}</p>
      </div>
      <p className="mt-1.5 truncate text-xs text-fg-2">
        {t(TASK_TYPE_LABELS[data.type])}
        {data.assigneeRole ? `, ${t(ROLE_LABELS[data.assigneeRole])}` : ''}
        {data.assigneeName ? `, ${data.assigneeName}` : ''}
        {data.dueInHours ? `, ${t('{n} h', { n: data.dueInHours })}` : ''}
      </p>
      {data.status && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-fg">
          <span className={clsx('size-2 rounded-full', status?.dot)} aria-hidden />
          {t(TASK_STATUS[data.status].label)}
          {data.overdue && <span className="text-bad">, {t('en retard')}</span>}
        </p>
      )}
      <Handle type="source" position={Position.Right} className="!size-3 !border-2 !border-card !bg-brand-500" />
    </div>
  );
}

export const nodeTypes = { task: TaskNode };
