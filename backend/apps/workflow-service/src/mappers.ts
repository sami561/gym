import { TaskDto, WorkflowDto, WorkflowRunDto } from '@app/common';
import { isFinished, isOverdue } from './engine/task-rules';
import { WorkflowRun } from './runs/workflow-run.entity';
import { Task } from './tasks/task.entity';
import { Workflow } from './workflows/workflow.entity';

const iso = (date: Date | null | undefined): string | null => (date ? date.toISOString() : null);

export function toWorkflowDto(workflow: Workflow): WorkflowDto {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    titleTemplate: workflow.titleTemplate,
    trigger: workflow.trigger,
    isActive: workflow.isActive,
    tasks: workflow.tasks ?? [],
    runCount: workflow.runCount,
    createdAt: workflow.createdAt.toISOString(),
    updatedAt: workflow.updatedAt.toISOString(),
  };
}

export function toTaskDto(task: Task, runTitle: string | null, now: Date = new Date()): TaskDto {
  return {
    id: task.id,
    runId: task.runId,
    runTitle,
    workflowId: task.workflowId,
    defId: task.defId,
    title: task.title,
    description: task.description,
    type: task.type,
    status: task.status,
    assigneeRole: task.assigneeRole,
    assigneeEmployeeId: task.assigneeEmployeeId,
    assigneeName: task.assigneeName,
    dependsOn: task.dependsOn ?? [],
    dueAt: iso(task.dueAt),
    isOverdue: isOverdue(task.status, task.dueAt, now),
    startedAt: iso(task.startedAt),
    completedAt: iso(task.completedAt),
    completedByName: task.completedByName,
    notes: task.notes,
    output: task.output,
    createdAt: task.createdAt.toISOString(),
  };
}

/** `tasks` given → included and used for progress; otherwise `progress` must be provided. */
export function toRunDto(
  run: WorkflowRun,
  tasks?: Task[],
  progress?: { done: number; total: number },
  now: Date = new Date(),
): WorkflowRunDto {
  const dto: WorkflowRunDto = {
    id: run.id,
    workflowId: run.workflowId,
    workflowName: run.workflowName,
    title: run.title,
    status: run.status,
    context: run.context ?? {},
    startedByName: run.startedByName,
    startedAt: run.startedAt.toISOString(),
    completedAt: iso(run.completedAt),
    progress: tasks
      ? { done: tasks.filter((task) => isFinished(task.status)).length, total: tasks.length }
      : (progress ?? { done: 0, total: 0 }),
  };
  if (tasks) {
    dto.tasks = [...tasks]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime())
      .map((task) => toTaskDto(task, run.title, now));
  }
  return dto;
}
