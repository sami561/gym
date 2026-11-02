import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Role, TaskStatus, TaskType, TaskViewer, WorkflowRunDto, WorkflowTaskDef } from '@app/common';
import { fillTemplate } from './templating';

export const FINISHED_STATUSES: TaskStatus[] = [TaskStatus.DONE, TaskStatus.SKIPPED];
export const OPEN_STATUSES: TaskStatus[] = [
  TaskStatus.BLOCKED,
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.FAILED,
];

export const isFinished = (status: TaskStatus): boolean => FINISHED_STATUSES.includes(status);
export const isOpen = (status: TaskStatus): boolean => OPEN_STATUSES.includes(status);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(id: unknown, message: string): string {
  if (typeof id !== 'string' || !UUID.test(id)) throw new NotFoundException(message);
  return id;
}

export function isOverdue(status: TaskStatus, dueAt: Date | null, now: Date = new Date()): boolean {
  return isOpen(status) && dueAt !== null && dueAt.getTime() < now.getTime();
}

/** Minimal shape the scheduling rules work on (entity or plain object). */
export interface TaskState {
  id: string;
  type: TaskType;
  status: TaskStatus;
  dependsOn: string[];
  dueInHours: number | null;
  dueAt: Date | null;
  startedAt: Date | null;
}

/**
 * A task leaves BLOCKED once every dependency is finished. A dependency that no
 * longer exists does not block (deleted tasks are unlinked, this is a safety net).
 */
export function readyToStart(task: Pick<TaskState, 'dependsOn'>, statusById: Map<string, TaskStatus>): boolean {
  return task.dependsOn.every((dep) => {
    const status = statusById.get(dep);
    return status === undefined || isFinished(status);
  });
}

/** Ids of BLOCKED candidates whose dependencies are all finished. */
export function planUnblock(candidates: TaskState[], statusById: Map<string, TaskStatus>): string[] {
  return candidates
    .filter((task) => task.status === TaskStatus.BLOCKED && readyToStart(task, statusById))
    .map((task) => task.id);
}

/** BLOCKED → TODO (people) or IN_PROGRESS (automations, executed right after). Mutates and returns the task. */
export function activate<T extends TaskState>(task: T, now: Date): T {
  if (task.type === TaskType.AUTOMATION) {
    task.status = TaskStatus.IN_PROGRESS;
    task.startedAt = now;
  } else {
    task.status = TaskStatus.TODO;
  }
  if (task.dueAt === null && task.dueInHours !== null && task.dueInHours !== undefined) {
    task.dueAt = new Date(now.getTime() + task.dueInHours * 3_600_000);
  }
  return task;
}

/** A run is complete when none of its tasks is still open. */
export function isRunComplete(statuses: TaskStatus[]): boolean {
  return statuses.every((status) => isFinished(status));
}

export interface InstantiatedTask extends TaskState {
  runId: string;
  workflowId: string;
  defId: string;
  title: string;
  description: string | null;
  assigneeRole: Role | null;
  assigneeEmployeeId: string | null;
  assigneeName: string | null;
  automation: WorkflowTaskDef['automation'] | null;
  sortOrder: number;
}

/** Copies a template into run tasks: new ids, links remapped, placeholders filled, roots activated. */
export function instantiateTasks(
  defs: WorkflowTaskDef[],
  run: { id: string; workflowId: string },
  context: Record<string, unknown>,
  now: Date,
  newId: () => string,
): InstantiatedTask[] {
  const idByDef = new Map(defs.map((def) => [def.id, newId()]));
  return defs.map((def, index) => {
    const task: InstantiatedTask = {
      id: idByDef.get(def.id)!,
      runId: run.id,
      workflowId: run.workflowId,
      defId: def.id,
      title: fillTemplate(def.title, context).slice(0, 160),
      description: def.description ? fillTemplate(def.description, context) : null,
      type: def.type,
      status: TaskStatus.BLOCKED,
      assigneeRole: def.assigneeRole ?? null,
      assigneeEmployeeId: def.assigneeEmployeeId ?? null,
      assigneeName: def.assigneeName ?? null,
      dependsOn: def.dependsOn.map((dep) => idByDef.get(dep)).filter((id): id is string => Boolean(id)),
      automation: def.automation ?? null,
      dueInHours: def.dueInHours ?? null,
      dueAt: null,
      startedAt: null,
      sortOrder: index,
    };
    return task.dependsOn.length ? task : activate(task, now);
  });
}

export interface TransitionCheck {
  type: TaskType;
  from: TaskStatus;
  to: TaskStatus;
  /** Titles of unfinished dependencies (only relevant when `from` is BLOCKED). */
  blockingTitles: string[];
}

export const quoteTitles = (titles: string[]): string => titles.map((title) => `« ${title} »`).join(', ');

/** Status changes a person may make. BLOCKED and FAILED are set by the engine only. */
export function assertTransition({ type, from, to, blockingTitles }: TransitionCheck): void {
  if (from === to) return;
  if (!Object.values(TaskStatus).includes(to)) throw new BadRequestException('Statut de tâche inconnu.');
  if (to === TaskStatus.BLOCKED) {
    throw new BadRequestException('Le statut « bloquée » est calculé automatiquement à partir des liens.');
  }
  if (to === TaskStatus.FAILED) {
    throw new BadRequestException('Le statut « échec » est réservé aux automatisations.');
  }
  if (from === TaskStatus.BLOCKED && to !== TaskStatus.SKIPPED) {
    throw new ConflictException(`Tâche bloquée par : ${quoteTitles(blockingTitles)}.`);
  }
  if (type === TaskType.AUTOMATION) {
    if (from === TaskStatus.IN_PROGRESS) throw new ConflictException("L'automatisation est en cours d'exécution.");
    if (to === TaskStatus.IN_PROGRESS || to === TaskStatus.TODO) {
      throw new BadRequestException('Utilisez « Relancer » pour exécuter une automatisation.');
    }
  }
}

interface Assignment {
  assigneeRole: Role | null;
  assigneeEmployeeId: string | null;
}

/** Visibility rule of the task board: ADMIN sees everything, others their role, themselves or unassigned. */
export function isVisibleTo(task: Assignment, user: TaskViewer): boolean {
  if (user.role === Role.ADMIN) return true;
  if (task.assigneeRole === null && task.assigneeEmployeeId === null) return true;
  if (task.assigneeRole === user.role) return true;
  return Boolean(user.employeeId) && task.assigneeEmployeeId === user.employeeId;
}

/**
 * Whether a task may depend on `dependency`. A scoped viewer (coach) only links tasks they
 * can see, but keeps the links the task already has (a template may link it to another
 * team's task). Without a viewer (ADMIN, STAFF) anything goes.
 */
export function canLinkTo(dependency: Assignment & { id: string }, viewer?: TaskViewer, linked: string[] = []): boolean {
  return !viewer || linked.includes(dependency.id) || isVisibleTo(dependency, viewer);
}

/** Stands for the tasks a scoped viewer cannot see in error messages. */
export const HIDDEN_TASK_TITLE = "tâche d'une autre équipe";

/** Titles to name in an error message: a scoped viewer never learns those of tasks they cannot see. */
export function titlesFor(tasks: (Assignment & { title: string })[], viewer?: TaskViewer): string[] {
  if (!viewer) return tasks.map((task) => task.title);
  return [...new Set(tasks.map((task) => (isVisibleTo(task, viewer) ? task.title : HIDDEN_TASK_TITLE)))];
}

/**
 * What a scoped viewer may read of a run: the tasks they can see and no context (the trigger
 * payload holds member data). Null when none of the run's tasks is theirs. `progress` still
 * counts the whole run. Without a viewer, or for an ADMIN, the run is returned as is.
 */
export function runForViewer(run: WorkflowRunDto, viewer?: TaskViewer): WorkflowRunDto | null {
  if (!viewer || viewer.role === Role.ADMIN) return run;
  const tasks = (run.tasks ?? []).filter((task) => isVisibleTo(task, viewer));
  return tasks.length ? { ...run, context: null, tasks } : null;
}
