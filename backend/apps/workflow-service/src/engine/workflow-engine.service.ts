import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  Actor,
  CreateTaskRequest,
  EVENTS,
  EventBus,
  OkResult,
  StartWorkflowRequest,
  TaskDto,
  TaskStatus,
  TaskType,
  UpdateTaskRequest,
  WorkflowRunDto,
  WorkflowRunStatus,
} from '@app/common';
import { toRunDto, toTaskDto } from '../mappers';
import { WorkflowRun } from '../runs/workflow-run.entity';
import { Task } from '../tasks/task.entity';
import { Workflow } from '../workflows/workflow.entity';
import { AutomationRunner } from './automation-runner';
import {
  assertRunOpen,
  isRunningAutomation,
  normalizeIds,
  optionalText,
  parseDate,
  parseRole,
  requiredTitle,
  runContext,
  runTitle,
} from './inputs';
import {
  activate,
  assertTransition,
  assertUuid,
  instantiateTasks,
  isFinished,
  isOpen,
  isRunComplete,
  planUnblock,
  quoteTitles,
} from './task-rules';
import { isPlainObject } from './templating';

/**
 * Every state change runs in a transaction holding this advisory lock, so changes are
 * serialised: two dependencies finishing at the same moment cannot both miss that their
 * common dependent became ready.
 */
const ENGINE_LOCK_KEY = 74_270_001;

/** Work to do once the transaction is committed. */
interface Effects {
  automations: string[];
  completedRuns: WorkflowRun[];
}

@Injectable()
export class WorkflowEngine implements OnApplicationBootstrap {
  private readonly logger = new Logger(WorkflowEngine.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly runner: AutomationRunner,
    private readonly events: EventBus,
  ) {}

  /** Automations interrupted by a restart are executed again (at-least-once). */
  async onApplicationBootstrap(): Promise<void> {
    const stuck = await this.dataSource.getRepository(Task).find({
      where: { type: TaskType.AUTOMATION, status: TaskStatus.IN_PROGRESS },
      select: { id: true },
    });
    stuck.forEach((task) => this.executeInBackground(task.id));
  }

  // ---------- runs ----------

  async start(request: StartWorkflowRequest, startedBy?: string): Promise<WorkflowRunDto> {
    const workflowId = assertUuid(request?.workflowId, 'Workflow introuvable.');
    const workflow = await this.dataSource.getRepository(Workflow).findOne({ where: { id: workflowId } });
    if (!workflow) throw new NotFoundException('Workflow introuvable.');
    if (!workflow.isActive) throw new ConflictException('Ce workflow est désactivé.');

    const now = new Date();
    const context = runContext(isPlainObject(request.context) ? request.context : {}, now);
    const title = runTitle(workflow, context, request.title, now);

    return this.mutate(async (manager, effects) => {
      const run = await manager.save(
        manager.create(WorkflowRun, {
          workflowId: workflow.id,
          workflowName: workflow.name,
          title,
          status: WorkflowRunStatus.RUNNING,
          context,
          startedByName: request.actor?.name ?? startedBy ?? null,
          startedAt: now,
          completedAt: null,
        }),
      );
      await manager.increment(Workflow, { id: workflow.id }, 'runCount', 1);
      const seeds = instantiateTasks(workflow.tasks ?? [], { id: run.id, workflowId: workflow.id }, context, now, randomUUID);
      const tasks = await manager.save(
        seeds.map((seed) =>
          manager.create(Task, { ...seed, completedAt: null, completedByName: null, notes: null, output: null }),
        ),
      );
      tasks.filter(isRunningAutomation).forEach((task) => effects.automations.push(task.id));
      await this.completeRunIfDone(manager, run, effects, tasks.map((task) => task.status));
      return toRunDto(run, tasks, undefined, now);
    });
  }

  async cancelRun(request: { id: string; actor?: Actor }): Promise<WorkflowRunDto> {
    const id = assertUuid(request?.id, 'Exécution introuvable.');
    return this.mutate(async (manager, effects) => {
      const run = await manager.findOne(WorkflowRun, { where: { id } });
      if (!run) throw new NotFoundException('Exécution introuvable.');
      if (run.status !== WorkflowRunStatus.RUNNING) throw new ConflictException("Ce workflow n'est plus en cours.");
      const now = new Date();
      const tasks = await manager.find(Task, { where: { runId: run.id } });
      const skipped = tasks.filter((task) => isOpen(task.status));
      for (const task of skipped) {
        task.status = TaskStatus.SKIPPED;
        task.completedAt = now;
        task.completedByName = request.actor?.name ?? 'Annulation';
      }
      if (skipped.length) await manager.save(skipped);
      run.status = WorkflowRunStatus.CANCELLED;
      run.completedAt = now;
      await manager.save(run);
      // Ad-hoc tasks linked to the cancelled ones may start now.
      await this.unblockDependentsOf(manager, skipped.map((task) => task.id), effects, now);
      return toRunDto(run, tasks, undefined, now);
    });
  }

  // ---------- tasks ----------

  async createTask(request: CreateTaskRequest): Promise<TaskDto> {
    const title = requiredTitle(request?.title);
    const dependsOn = normalizeIds(request.dependsOn);
    const values = {
      description: optionalText(request.description),
      assigneeRole: parseRole(request.assigneeRole),
      assigneeEmployeeId: optionalText(request.assigneeEmployeeId),
      assigneeName: optionalText(request.assigneeName),
      dueAt: parseDate(request.dueAt),
    };
    return this.mutate(async (manager) => {
      const dependencies = await this.loadDependencies(manager, dependsOn);
      const task = manager.create(Task, {
        id: randomUUID(),
        runId: null,
        workflowId: null,
        defId: null,
        title,
        ...values,
        type: TaskType.MANUAL,
        status: dependencies.some((dep) => !isFinished(dep.status)) ? TaskStatus.BLOCKED : TaskStatus.TODO,
        dependsOn,
        automation: null,
        dueInHours: null,
        startedAt: null,
        completedAt: null,
        completedByName: null,
        notes: null,
        output: null,
        sortOrder: 0,
      });
      return toTaskDto(await manager.save(task), null);
    });
  }

  async updateTask(request: UpdateTaskRequest): Promise<TaskDto> {
    const id = assertUuid(request?.id, 'Tâche introuvable.');
    const data = request.data ?? {};
    return this.mutate(async (manager, effects) => {
      const task = await this.findTask(manager, id);
      const run = task.runId ? await manager.findOne(WorkflowRun, { where: { id: task.runId } }) : null;
      if (run) assertRunOpen(run);
      const now = new Date();

      if (data.title !== undefined) task.title = requiredTitle(data.title);
      if (data.description !== undefined) task.description = optionalText(data.description);
      if (data.assigneeRole !== undefined) task.assigneeRole = parseRole(data.assigneeRole);
      if (data.assigneeEmployeeId !== undefined) task.assigneeEmployeeId = optionalText(data.assigneeEmployeeId);
      if (data.assigneeName !== undefined) task.assigneeName = optionalText(data.assigneeName);
      if (data.dueAt !== undefined) task.dueAt = parseDate(data.dueAt);
      if (data.notes !== undefined) task.notes = optionalText(data.notes);
      if (data.dependsOn !== undefined) await this.relink(manager, task, normalizeIds(data.dependsOn), effects, now);
      if (data.status !== undefined && data.status !== task.status) {
        await this.transition(manager, task, data.status, request.actor, effects, now);
      }

      await manager.save(task);
      if (run) await this.completeRunIfDone(manager, run, effects);
      return toTaskDto(task, run?.title ?? null, now);
    });
  }

  /** Re-runs a FAILED automation and waits for its result. */
  async retry(request: { id: string; actor?: Actor }): Promise<TaskDto> {
    const id = assertUuid(request?.id, 'Tâche introuvable.');
    await this.mutate(async (manager) => {
      const task = await this.findTask(manager, id);
      if (task.type !== TaskType.AUTOMATION) {
        throw new BadRequestException('Seules les automatisations peuvent être relancées.');
      }
      if (task.status !== TaskStatus.FAILED) {
        throw new ConflictException('Seule une automatisation en échec peut être relancée.');
      }
      const run = task.runId ? await manager.findOne(WorkflowRun, { where: { id: task.runId } }) : null;
      if (run) assertRunOpen(run);
      task.status = TaskStatus.IN_PROGRESS;
      task.startedAt = new Date();
      task.output = null;
      await manager.save(task);
    });
    await this.execute(id);
    return this.taskDto(id);
  }

  async removeTask(request: { id: string }): Promise<OkResult> {
    const id = assertUuid(request?.id, 'Tâche introuvable.');
    return this.mutate(async (manager, effects) => {
      const task = await this.findTask(manager, id);
      await manager.delete(Task, { id: task.id });
      const dependents = await this.dependentsOf(manager, task.id);
      dependents.forEach((dependent) => (dependent.dependsOn = dependent.dependsOn.filter((dep) => dep !== task.id)));
      if (dependents.length) await manager.save(dependents);
      // Tasks that were only waiting for the removed one can start.
      await this.unblockCandidates(manager, dependents.filter((d) => d.status === TaskStatus.BLOCKED), effects, new Date());
      if (task.runId) {
        const run = await manager.findOne(WorkflowRun, { where: { id: task.runId } });
        if (run) await this.completeRunIfDone(manager, run, effects);
      }
      return { ok: true };
    });
  }

  async taskDto(id: string): Promise<TaskDto> {
    const task = await this.dataSource.getRepository(Task).findOne({ where: { id }, relations: { run: true } });
    if (!task) throw new NotFoundException('Tâche introuvable.');
    return toTaskDto(task, task.run?.title ?? null);
  }

  // ---------- state machine ----------

  private async transition(
    manager: EntityManager,
    task: Task,
    next: TaskStatus,
    actor: Actor | undefined,
    effects: Effects,
    now: Date,
  ): Promise<void> {
    if (task.status === TaskStatus.BLOCKED) {
      const blocking = await this.unfinishedDependencies(manager, task);
      // Safety net: a BLOCKED task whose dependencies are all finished is simply ready.
      if (blocking.length === 0) activate(task, now);
      else assertTransition({ type: task.type, from: task.status, to: next, blockingTitles: blocking.map((t) => t.title) });
    }
    const previous = task.status;
    if (previous === next) return;
    assertTransition({ type: task.type, from: previous, to: next, blockingTitles: [] });
    if (isFinished(previous) && !isFinished(next)) await this.reblockDependents(manager, task);

    task.status = next;
    if (next === TaskStatus.IN_PROGRESS && !task.startedAt) task.startedAt = now;
    if (!isFinished(next)) {
      task.completedAt = null;
      task.completedByName = null;
    } else if (!isFinished(previous)) {
      task.completedAt = now;
      task.completedByName = actor?.name ?? null;
    }
    await manager.save(task);
    if (isFinished(next) && !isFinished(previous)) await this.unblockDependentsOf(manager, [task.id], effects, now);
  }

  /** Reopening a finished task puts its not-yet-started dependents back to BLOCKED. */
  private async reblockDependents(manager: EntityManager, task: Task): Promise<void> {
    const dependents = await this.dependentsOf(manager, task.id);
    const advanced = dependents.filter((d) => d.status === TaskStatus.IN_PROGRESS || d.status === TaskStatus.DONE);
    if (advanced.length) {
      throw new ConflictException(`Impossible de rouvrir : ${quoteTitles(advanced.map((d) => d.title))} a déjà avancé.`);
    }
    const toBlock = dependents.filter((d) => d.status === TaskStatus.TODO || d.status === TaskStatus.FAILED);
    for (const dependent of toBlock) {
      dependent.status = TaskStatus.BLOCKED;
      if (dependent.dueInHours !== null) dependent.dueAt = null;
      if (dependent.type === TaskType.AUTOMATION) dependent.startedAt = null;
    }
    if (toBlock.length) await manager.save(toBlock);
  }

  private async relink(manager: EntityManager, task: Task, ids: string[], effects: Effects, now: Date): Promise<void> {
    if (ids.includes(task.id)) throw new BadRequestException("Une tâche ne peut pas dépendre d'elle-même.");
    const dependencies = await this.loadDependencies(manager, ids);
    await this.assertNoCycle(manager, task.id, dependencies);
    task.dependsOn = ids;
    if (task.status !== TaskStatus.TODO && task.status !== TaskStatus.BLOCKED) return;
    if (dependencies.some((dep) => !isFinished(dep.status))) {
      task.status = TaskStatus.BLOCKED;
      if (task.dueInHours !== null) task.dueAt = null;
    } else if (task.status === TaskStatus.BLOCKED) {
      activate(task, now);
      if (isRunningAutomation(task)) effects.automations.push(task.id);
    }
  }

  /** Walks the dependencies of the new links: reaching `taskId` again means a loop. */
  private async assertNoCycle(manager: EntityManager, taskId: string, dependencies: Task[]): Promise<void> {
    const visited = new Set<string>();
    let frontier = dependencies.flatMap((dep) => dep.dependsOn ?? []);
    while (frontier.length) {
      if (frontier.includes(taskId)) throw new BadRequestException('Ce lien créerait une boucle entre les tâches.');
      const next = [...new Set(frontier)].filter((id) => !visited.has(id));
      if (!next.length) return;
      next.forEach((id) => visited.add(id));
      const rows = await manager.find(Task, { where: { id: In(next) }, select: { id: true, dependsOn: true } });
      frontier = rows.flatMap((row) => row.dependsOn ?? []);
    }
  }

  private async unblockDependentsOf(manager: EntityManager, finishedIds: string[], effects: Effects, now: Date) {
    if (!finishedIds.length) return;
    const candidates = await manager
      .createQueryBuilder(Task, 't')
      .where('"t"."status" = :blocked', { blocked: TaskStatus.BLOCKED })
      .andWhere('"t"."dependsOn" ?| CAST(ARRAY[:...ids] AS text[])', { ids: finishedIds })
      .getMany();
    await this.unblockCandidates(manager, candidates, effects, now);
  }

  private async unblockCandidates(manager: EntityManager, candidates: Task[], effects: Effects, now: Date) {
    if (!candidates.length) return;
    const dependencyIds = [...new Set(candidates.flatMap((task) => task.dependsOn))];
    const dependencies = dependencyIds.length
      ? await manager.find(Task, { where: { id: In(dependencyIds) }, select: { id: true, status: true } })
      : [];
    const ready = new Set(planUnblock(candidates, new Map(dependencies.map((dep) => [dep.id, dep.status]))));
    const activated = candidates.filter((task) => ready.has(task.id)).map((task) => activate(task, now));
    if (!activated.length) return;
    await manager.save(activated);
    activated.filter(isRunningAutomation).forEach((task) => effects.automations.push(task.id));
  }

  private async completeRunIfDone(
    manager: EntityManager,
    run: WorkflowRun,
    effects: Effects,
    statuses?: TaskStatus[],
  ): Promise<void> {
    if (run.status !== WorkflowRunStatus.RUNNING) return;
    const current =
      statuses ??
      (await manager.find(Task, { where: { runId: run.id }, select: { id: true, status: true } })).map((t) => t.status);
    if (!isRunComplete(current)) return;
    run.status = WorkflowRunStatus.COMPLETED;
    run.completedAt = new Date();
    await manager.save(run);
    effects.completedRuns.push(run);
  }

  // ---------- automations ----------

  private executeInBackground(taskId: string): void {
    void this.execute(taskId).catch((err: Error) => this.logger.error(`Automation ${taskId} crashed: ${err.stack ?? err}`));
  }

  private async execute(taskId: string): Promise<void> {
    const task = await this.dataSource.getRepository(Task).findOne({ where: { id: taskId }, relations: { run: true } });
    if (!task || !isRunningAutomation(task)) return;
    const result = task.automation
      ? await this.runner.run(task.automation, {
          runId: task.runId,
          runTitle: task.run?.title ?? null,
          task: { id: task.id, title: task.title },
          context: task.run?.context ?? {},
        })
      : { ok: false, output: "Automatisation sans URL." };

    await this.mutate(async (manager, effects) => {
      const fresh = await manager.findOne(Task, { where: { id: taskId } });
      // Cancelled, skipped or deleted while the call was running: keep what people decided.
      if (!fresh || !isRunningAutomation(fresh)) return;
      const now = new Date();
      fresh.output = result.output;
      if (result.ok) {
        fresh.status = TaskStatus.DONE;
        fresh.completedAt = now;
        fresh.completedByName = 'Automatisation';
      } else {
        fresh.status = TaskStatus.FAILED;
      }
      await manager.save(fresh);
      if (result.ok) await this.unblockDependentsOf(manager, [fresh.id], effects, now);
      if (fresh.runId) {
        const run = await manager.findOne(WorkflowRun, { where: { id: fresh.runId } });
        if (run) await this.completeRunIfDone(manager, run, effects);
      }
    });
    if (!result.ok) this.logger.warn(`Automation "${task.title}" failed: ${result.output}`);
  }

  // ---------- helpers ----------

  private async mutate<T>(work: (manager: EntityManager, effects: Effects) => Promise<T>): Promise<T> {
    const effects: Effects = { automations: [], completedRuns: [] };
    const result = await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [ENGINE_LOCK_KEY]);
      return work(manager, effects);
    });
    for (const run of effects.completedRuns) {
      this.events.publish(EVENTS.workflowCompleted, {
        runId: run.id,
        workflowId: run.workflowId,
        workflowName: run.workflowName,
        title: run.title,
        completedAt: (run.completedAt ?? new Date()).toISOString(),
      });
    }
    effects.automations.forEach((id) => this.executeInBackground(id));
    return result;
  }

  private async findTask(manager: EntityManager, id: string): Promise<Task> {
    const task = await manager.findOne(Task, { where: { id } });
    if (!task) throw new NotFoundException('Tâche introuvable.');
    return task;
  }

  private async loadDependencies(manager: EntityManager, ids: string[]): Promise<Task[]> {
    if (!ids.length) return [];
    const found = await manager.find(Task, { where: { id: In(ids) } });
    if (found.length !== ids.length) throw new BadRequestException('Tâche liée introuvable.');
    return found;
  }

  private async unfinishedDependencies(manager: EntityManager, task: Task): Promise<Task[]> {
    if (!task.dependsOn.length) return [];
    const dependencies = await manager.find(Task, { where: { id: In(task.dependsOn) } });
    return dependencies.filter((dep) => !isFinished(dep.status));
  }

  private dependentsOf(manager: EntityManager, id: string): Promise<Task[]> {
    return manager.createQueryBuilder(Task, 't').where('"t"."dependsOn" ? :id', { id }).getMany();
  }
}
