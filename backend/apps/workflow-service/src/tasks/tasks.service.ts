import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import {
  ListTasksRequest,
  Role,
  TaskDto,
  TaskStatus,
  WorkflowRunStatus,
  WorkflowStats,
  startOfDay,
} from '@app/common';
import { OPEN_STATUSES, assertUuid } from '../engine/task-rules';
import { toTaskDto } from '../mappers';
import { WorkflowRun } from '../runs/workflow-run.entity';
import { Workflow } from '../workflows/workflow.entity';
import { Task } from './task.entity';

const MAX_TASKS = 500;

/** Monday 00:00 of the current week (gym timezone). */
function startOfWeek(now: Date): Date {
  const day = startOfDay(now);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}

/** Read side of tasks (board, filters, stats). Mutations go through WorkflowEngine. */
@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectRepository(WorkflowRun) private readonly runs: Repository<WorkflowRun>,
    @InjectRepository(Workflow) private readonly workflows: Repository<Workflow>,
  ) {}

  async list(request: ListTasksRequest): Promise<TaskDto[]> {
    const now = new Date();
    const qb = this.tasks.createQueryBuilder('t').leftJoinAndSelect('t.run', 'r');

    if (request.status === 'OPEN') {
      qb.andWhere('t.status IN (:...open)', { open: OPEN_STATUSES });
    } else if (request.status) {
      if (!Object.values(TaskStatus).includes(request.status)) throw new BadRequestException('Statut de tâche inconnu.');
      qb.andWhere('t.status = :status', { status: request.status });
    }
    if (request.runId) qb.andWhere('t.runId = :runId', { runId: assertUuid(request.runId, 'Exécution introuvable.') });
    if (request.assigneeRole) qb.andWhere('t.assigneeRole = :assigneeRole', { assigneeRole: request.assigneeRole });
    if (request.assigneeEmployeeId) {
      qb.andWhere('t.assigneeEmployeeId = :assigneeEmployeeId', { assigneeEmployeeId: request.assigneeEmployeeId });
    }
    if (request.overdueOnly) {
      qb.andWhere('t.status IN (:...openForOverdue) AND t.dueAt < :now', { openForOverdue: OPEN_STATUSES, now });
    }
    const user = request.forUser;
    if (user && user.role !== Role.ADMIN) {
      // Same rule as isVisibleTo(): their role, themselves, or nobody in particular.
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('t.assigneeRole = :userRole', { userRole: user.role })
            .orWhere('(t.assigneeRole IS NULL AND t.assigneeEmployeeId IS NULL)');
          if (user.employeeId) where.orWhere('t.assigneeEmployeeId = :userEmployeeId', { userEmployeeId: user.employeeId });
        }),
      );
    }

    const tasks = await qb
      .orderBy('t.dueAt', 'ASC', 'NULLS LAST')
      .addOrderBy('t.createdAt', 'ASC')
      .addOrderBy('t.sortOrder', 'ASC')
      .limit(MAX_TASKS)
      .getMany();
    return tasks.map((task) => toTaskDto(task, task.run?.title ?? null, now));
  }

  async stats(): Promise<WorkflowStats> {
    const now = new Date();
    const [activeWorkflows, runningRuns, openTasks, overdueTasks, completedTasksThisWeek] = await Promise.all([
      this.workflows.count({ where: { isActive: true } }),
      this.runs.count({ where: { status: WorkflowRunStatus.RUNNING } }),
      this.tasks.count({ where: { status: In(OPEN_STATUSES) } }),
      this.tasks.count({ where: { status: In(OPEN_STATUSES), dueAt: LessThan(now) } }),
      this.tasks.count({ where: { status: TaskStatus.DONE, completedAt: MoreThanOrEqual(startOfWeek(now)) } }),
    ]);
    return { activeWorkflows, runningRuns, openTasks, overdueTasks, completedTasksThisWeek };
  }
}
