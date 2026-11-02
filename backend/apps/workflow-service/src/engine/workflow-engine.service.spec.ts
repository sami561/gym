import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, FindOperator } from 'typeorm';
import { EventBus, Role, TaskStatus, TaskType, TaskViewer, WorkflowRunStatus } from '@app/common';
import { WorkflowRun } from '../runs/workflow-run.entity';
import { Task } from '../tasks/task.entity';
import { AutomationRunner } from './automation-runner';
import { WorkflowEngine } from './workflow-engine.service';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const RUN_ID = id(100);
const CALL = id(1); // STAFF: welcome call
const PROGRAM = id(2); // COACH, waits for the call
const MEASURE = id(3); // COACH, waits for the program
const HOOK = id(4); // unassigned automation
const STAFF_ADHOC = id(5);
const COACH_ADHOC = id(6);
const MISSING = id(99);

const COACH: TaskViewer = { role: Role.COACH };
const ACTOR = { id: 'user-1', role: Role.COACH, name: 'Coach Sami' };

function makeTask(taskId: string, patch: Partial<Task>): Task {
  return Object.assign(new Task(), {
    id: taskId,
    runId: RUN_ID,
    workflowId: id(200),
    defId: null,
    title: taskId,
    description: null,
    type: TaskType.MANUAL,
    status: TaskStatus.TODO,
    assigneeRole: null,
    assigneeEmployeeId: null,
    assigneeName: null,
    dependsOn: [],
    automation: null,
    dueInHours: null,
    dueAt: null,
    startedAt: null,
    completedAt: null,
    completedByName: null,
    notes: null,
    output: null,
    sortOrder: 0,
    createdAt: new Date('2026-11-02T08:00:00.000Z'),
    updatedAt: new Date('2026-11-02T08:00:00.000Z'),
    ...patch,
  });
}

/** Engine over an in-memory onboarding run (the manager fakes the few queries the engine makes). */
function setup() {
  const run = Object.assign(new WorkflowRun(), {
    id: RUN_ID,
    workflowId: id(200),
    workflowName: 'Onboarding',
    title: 'Onboarding — Amira',
    status: WorkflowRunStatus.RUNNING,
    context: { firstName: 'Amira', phone: '+216 20 000 000' },
    startedByName: null,
    startedAt: new Date('2026-11-02T08:00:00.000Z'),
    completedAt: null,
  });
  const tasks = [
    makeTask(CALL, { title: 'Appel de bienvenue à Amira', assigneeRole: Role.STAFF }),
    makeTask(PROGRAM, { title: 'Programme initial', assigneeRole: Role.COACH, status: TaskStatus.BLOCKED, dependsOn: [CALL] }),
    makeTask(MEASURE, { title: 'Mensurations', assigneeRole: Role.COACH, status: TaskStatus.BLOCKED, dependsOn: [PROGRAM] }),
    makeTask(HOOK, { title: 'Prévenir n8n', type: TaskType.AUTOMATION, status: TaskStatus.FAILED }),
    makeTask(STAFF_ADHOC, { runId: null, workflowId: null, title: 'Rembourser M. Ben Ali', assigneeRole: Role.STAFF }),
    makeTask(COACH_ADHOC, { runId: null, workflowId: null, title: 'Ranger les kettlebells', assigneeRole: Role.COACH }),
  ];
  const byId = (taskId: string) => tasks.find((task) => task.id === taskId) ?? null;
  const idsOf = (value: unknown): string[] => (value instanceof FindOperator ? (value.value as string[]) : [value as string]);

  const manager = {
    query: jest.fn(),
    findOne: jest.fn(async (entity: unknown, { where }: { where: { id: string } }) =>
      entity === WorkflowRun ? (where.id === RUN_ID ? run : null) : byId(where.id),
    ),
    find: jest.fn(async (_entity: unknown, { where }: { where: { id?: unknown; runId?: string } }) =>
      where.runId ? tasks.filter((task) => task.runId === where.runId) : tasks.filter((task) => idsOf(where.id).includes(task.id)),
    ),
    save: jest.fn(async <T>(entity: T) => entity),
    create: jest.fn((_entity: unknown, values: Partial<Task>) => {
      const task = makeTask(values.id!, values);
      tasks.push(task);
      return task;
    }),
    createQueryBuilder: jest.fn(() => {
      const params: { id?: string; ids?: string[] } = {};
      const qb = {
        where: (_sql: string, values?: object) => (Object.assign(params, values), qb),
        andWhere: (_sql: string, values?: object) => (Object.assign(params, values), qb),
        // Blocked tasks waiting for one of `ids` (unblock), or every task depending on `id`.
        getMany: async () =>
          params.ids
            ? tasks.filter((task) => task.status === TaskStatus.BLOCKED && task.dependsOn.some((dep) => params.ids!.includes(dep)))
            : tasks.filter((task) => task.dependsOn.includes(params.id!)),
      };
      return qb;
    }),
  };
  const dataSource = {
    transaction: jest.fn(async (work: (m: typeof manager) => unknown) => work(manager)),
    getRepository: jest.fn(() => ({ findOne: async ({ where }: { where: { id: string } }) => byId(where.id) })),
  };
  const runner = { run: jest.fn(async () => ({ ok: true, output: 'HTTP 200' })) };
  const engine = new WorkflowEngine(
    dataSource as unknown as DataSource,
    runner as unknown as AutomationRunner,
    { publish: jest.fn() } as unknown as EventBus,
  );
  return { engine, manager, runner, task: (taskId: string) => byId(taskId)! };
}

async function failure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (err) {
    return err as Error;
  }
  throw new Error('expected the call to fail');
}

describe('WorkflowEngine — coach scope (forUser)', () => {
  it('answers 404 to a coach acting on a STAFF task, before reading or changing anything else', async () => {
    const { engine, manager, task } = setup();
    const error = await failure(engine.updateTask({ id: CALL, data: { status: TaskStatus.SKIPPED }, actor: ACTOR, forUser: COACH }));
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.message).toBe('Tâche introuvable.');
    expect(manager.findOne).toHaveBeenCalledTimes(1);
    expect(manager.save).not.toHaveBeenCalled();
    expect(task(CALL).status).toBe(TaskStatus.TODO);
    expect(task(PROGRAM).status).toBe(TaskStatus.BLOCKED);
  });

  it('lets a coach work on their tasks and the unassigned ones', async () => {
    const { engine, task } = setup();
    task(PROGRAM).status = TaskStatus.TODO;
    const done = await engine.updateTask({ id: PROGRAM, data: { status: TaskStatus.DONE }, actor: ACTOR, forUser: COACH });
    expect(done).toMatchObject({ status: TaskStatus.DONE, completedByName: 'Coach Sami' });
    expect(task(MEASURE).status).toBe(TaskStatus.TODO);
    const noted = await engine.updateTask({ id: HOOK, data: { notes: 'Vérifier n8n' }, actor: ACTOR, forUser: COACH });
    expect(noted.notes).toBe('Vérifier n8n');
  });

  it('keeps today’s behaviour for ADMIN and STAFF (no forUser)', async () => {
    const { engine, task } = setup();
    const skipped = await engine.updateTask({ id: CALL, data: { status: TaskStatus.SKIPPED }, actor: { ...ACTOR, role: Role.STAFF } });
    expect(skipped.status).toBe(TaskStatus.SKIPPED);
    expect(task(PROGRAM).status).toBe(TaskStatus.TODO);
  });

  it('does not name the tasks a coach cannot see in the "blocked" message', async () => {
    const { engine } = setup();
    const forCoach = await failure(engine.updateTask({ id: PROGRAM, data: { status: TaskStatus.DONE }, forUser: COACH }));
    expect(forCoach).toEqual(new ConflictException("Tâche bloquée par : « tâche d'une autre équipe »."));
    const forStaff = await failure(engine.updateTask({ id: PROGRAM, data: { status: TaskStatus.DONE } }));
    expect(forStaff).toEqual(new ConflictException('Tâche bloquée par : « Appel de bienvenue à Amira ».'));
  });

  it('only lets a coach add links to tasks they can see, keeping the links a task already has', async () => {
    const { engine, task } = setup();
    // The template link to the STAFF call stays when the coach sends it back unchanged.
    await expect(engine.updateTask({ id: PROGRAM, data: { dependsOn: [CALL] }, forUser: COACH })).resolves.toMatchObject({
      dependsOn: [CALL],
    });
    for (const dependsOn of [[STAFF_ADHOC], [MISSING], [PROGRAM, STAFF_ADHOC]]) {
      const error = await failure(engine.updateTask({ id: COACH_ADHOC, data: { dependsOn }, forUser: COACH }));
      expect(error).toEqual(new BadRequestException('Tâche liée introuvable.'));
    }
    expect(task(COACH_ADHOC).dependsOn).toEqual([]);
    await expect(engine.updateTask({ id: COACH_ADHOC, data: { dependsOn: [PROGRAM] }, forUser: COACH })).resolves.toMatchObject({
      dependsOn: [PROGRAM],
      status: TaskStatus.BLOCKED,
    });
    // Staff may link anything.
    await expect(engine.updateTask({ id: COACH_ADHOC, data: { dependsOn: [STAFF_ADHOC] } })).resolves.toMatchObject({
      dependsOn: [STAFF_ADHOC],
    });
  });

  it('checks the links of a task a coach creates', async () => {
    const { engine } = setup();
    for (const dependsOn of [[STAFF_ADHOC], [MISSING]]) {
      const error = await failure(engine.createTask({ title: 'Bilan', dependsOn, actor: ACTOR, forUser: COACH }));
      expect(error).toEqual(new BadRequestException('Tâche liée introuvable.'));
    }
    await expect(engine.createTask({ title: 'Bilan', dependsOn: [COACH_ADHOC], actor: ACTOR, forUser: COACH })).resolves.toMatchObject({
      title: 'Bilan',
      dependsOn: [COACH_ADHOC],
      status: TaskStatus.BLOCKED,
    });
    // A coach may still hand a task to another team.
    await expect(
      engine.createTask({ title: 'Changer une ampoule', assigneeRole: Role.STAFF, actor: ACTOR, forUser: COACH }),
    ).resolves.toMatchObject({ assigneeRole: Role.STAFF, status: TaskStatus.TODO });
  });

  it('answers 404 to a scoped retry of a task the caller cannot see', async () => {
    const { engine, runner, task } = setup();
    task(HOOK).assigneeRole = Role.STAFF;
    const error = await failure(engine.retry({ id: HOOK, actor: ACTOR, forUser: COACH }));
    expect(error).toEqual(new NotFoundException('Tâche introuvable.'));
    expect(runner.run).not.toHaveBeenCalled();
    expect(task(HOOK).status).toBe(TaskStatus.FAILED);
  });
});
