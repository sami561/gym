import { Actor } from './common.contracts';
import { Role } from './auth.contracts';

/**
 * Workflows = reusable templates made of linked tasks (a DAG: a task starts when
 * every task it depends on is DONE or SKIPPED). A run instantiates the template;
 * tasks can also exist on their own (ad-hoc) and be linked to other tasks.
 */
export enum WorkflowTriggerType {
  MANUAL = 'MANUAL',
  EVENT = 'EVENT',
  SCHEDULE = 'SCHEDULE',
}

export enum TaskType {
  /** Done by a person (reception, coach, cleaning...). */
  MANUAL = 'MANUAL',
  /** Executed by the engine: HTTP call (e.g. an n8n webhook). */
  AUTOMATION = 'AUTOMATION',
}

export enum TaskStatus {
  BLOCKED = 'BLOCKED',
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
  SKIPPED = 'SKIPPED',
  FAILED = 'FAILED',
}

export enum WorkflowRunStatus {
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface WorkflowTrigger {
  type: WorkflowTriggerType;
  /** EVENT: one of TRIGGERABLE_EVENTS. */
  event?: string | null;
  /** SCHEDULE: 5-field cron in the gym timezone, e.g. "45 5 * * 1-6". */
  cron?: string | null;
}

export interface TaskAutomation {
  kind: 'WEBHOOK';
  url: string;
  method?: 'POST' | 'GET';
  /** Extra JSON merged into the body; {{placeholders}} are filled from the run context. */
  body?: Record<string, unknown> | null;
}

/** A task inside a workflow template. `id` is a stable key chosen by the editor. */
export interface WorkflowTaskDef {
  id: string;
  title: string;
  description?: string | null;
  type: TaskType;
  assigneeRole?: Role | null;
  assigneeEmployeeId?: string | null;
  assigneeName?: string | null;
  /** Due date = moment the task becomes TODO + dueInHours. */
  dueInHours?: number | null;
  /** Ids of tasks of the same workflow that must be finished first. */
  dependsOn: string[];
  automation?: TaskAutomation | null;
  /** Node position in the visual editor. */
  position?: { x: number; y: number } | null;
}

export interface WorkflowDto {
  id: string;
  name: string;
  description: string | null;
  /** Run title template, e.g. "Onboarding — {{firstName}} {{lastName}}". */
  titleTemplate: string | null;
  trigger: WorkflowTrigger;
  isActive: boolean;
  tasks: WorkflowTaskDef[];
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkflowRequest {
  name: string;
  description?: string | null;
  titleTemplate?: string | null;
  trigger: WorkflowTrigger;
  isActive?: boolean;
  tasks: WorkflowTaskDef[];
}

export interface UpdateWorkflowRequest {
  id: string;
  data: Partial<CreateWorkflowRequest>;
}

export interface StartWorkflowRequest {
  workflowId: string;
  /** Values available to {{placeholders}} (event payload for EVENT triggers). */
  context?: Record<string, unknown>;
  title?: string;
  actor?: Actor;
}

export interface TaskDto {
  id: string;
  runId: string | null;
  runTitle: string | null;
  workflowId: string | null;
  /** Template task id this task was created from. */
  defId: string | null;
  title: string;
  description: string | null;
  type: TaskType;
  status: TaskStatus;
  assigneeRole: Role | null;
  assigneeEmployeeId: string | null;
  assigneeName: string | null;
  /** Ids of tasks that must be finished before this one. */
  dependsOn: string[];
  dueAt: string | null;
  isOverdue: boolean;
  startedAt: string | null;
  completedAt: string | null;
  completedByName: string | null;
  notes: string | null;
  /** AUTOMATION result or error message. */
  output: string | null;
  createdAt: string;
}

export interface WorkflowRunDto {
  id: string;
  workflowId: string;
  workflowName: string;
  title: string;
  status: WorkflowRunStatus;
  context: Record<string, unknown>;
  startedByName: string | null;
  startedAt: string;
  completedAt: string | null;
  progress: { done: number; total: number };
  tasks?: TaskDto[];
}

export interface ListRunsRequest {
  workflowId?: string;
  status?: WorkflowRunStatus;
  limit?: number;
}

export interface ListTasksRequest {
  status?: TaskStatus | 'OPEN';
  runId?: string;
  assigneeRole?: Role;
  assigneeEmployeeId?: string;
  overdueOnly?: boolean;
  /** Tasks visible to this caller: assigned to their role, to them, or unassigned. */
  forUser?: { role: Role; employeeId?: string | null };
}

export interface CreateTaskRequest {
  title: string;
  description?: string | null;
  assigneeRole?: Role | null;
  assigneeEmployeeId?: string | null;
  assigneeName?: string | null;
  dueAt?: string | null;
  dependsOn?: string[];
  actor?: Actor;
}

export interface UpdateTaskRequest {
  id: string;
  data: {
    title?: string;
    description?: string | null;
    status?: TaskStatus;
    assigneeRole?: Role | null;
    assigneeEmployeeId?: string | null;
    assigneeName?: string | null;
    dueAt?: string | null;
    dependsOn?: string[];
    notes?: string | null;
  };
  actor?: Actor;
}

export interface WorkflowStats {
  activeWorkflows: number;
  runningRuns: number;
  openTasks: number;
  overdueTasks: number;
  completedTasksThisWeek: number;
}

/** Domain events a workflow can be triggered by. */
export const TRIGGERABLE_EVENTS = [
  'member.created',
  'subscription.created',
  'subscription.expiring',
  'subscription.expired',
  'payment.received',
  'booking.created',
  'lead.created',
  'sale.completed',
  'stock.low',
  'maintenance.opened',
] as const;
