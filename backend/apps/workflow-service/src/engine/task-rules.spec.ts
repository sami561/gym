import { BadRequestException, ConflictException } from '@nestjs/common';
import { Role, TaskDto, TaskStatus, TaskType, WorkflowRunDto, WorkflowRunStatus, WorkflowTaskDef } from '@app/common';
import {
  HIDDEN_TASK_TITLE,
  InstantiatedTask,
  activate,
  assertTransition,
  canLinkTo,
  instantiateTasks,
  isOverdue,
  isRunComplete,
  isVisibleTo,
  planUnblock,
  runForViewer,
  titlesFor,
} from './task-rules';

const NOW = new Date('2026-11-02T08:00:00.000Z');

const def = (id: string, dependsOn: string[] = [], extra: Partial<WorkflowTaskDef> = {}): WorkflowTaskDef => ({
  id,
  title: id,
  type: TaskType.MANUAL,
  dependsOn,
  ...extra,
});

function instantiate(defs: WorkflowTaskDef[], context: Record<string, unknown> = {}): InstantiatedTask[] {
  let counter = 0;
  return instantiateTasks(defs, { id: 'run-1', workflowId: 'wf-1' }, context, NOW, () => `task-${++counter}`);
}

/** Mirrors WorkflowEngine: finishing a task activates the dependents that became ready. */
function finish(tasks: InstantiatedTask[], defId: string, status = TaskStatus.DONE): string[] {
  const task = tasks.find((t) => t.defId === defId)!;
  task.status = status;
  const statusById = new Map(tasks.map((t) => [t.id, t.status]));
  const ready = planUnblock(tasks.filter((t) => t.dependsOn.includes(task.id)), statusById);
  ready.forEach((id) => activate(tasks.find((t) => t.id === id)!, NOW));
  return ready.map((id) => tasks.find((t) => t.id === id)!.defId);
}

const statusOf = (tasks: InstantiatedTask[]) => Object.fromEntries(tasks.map((t) => [t.defId, t.status]));

describe('task rules', () => {
  it('instantiates a run: new ids, remapped links, filled placeholders, roots ready with due dates', () => {
    const tasks = instantiate(
      [
        def('call', [], { title: 'Appeler {{firstName}}', dueInHours: 24 }),
        def('program', ['call'], { dueInHours: 72, assigneeRole: Role.COACH }),
      ],
      { firstName: 'Amira' },
    );
    expect(tasks.map((t) => t.id)).toEqual(['task-1', 'task-2']);
    expect(tasks[0]).toMatchObject({ title: 'Appeler Amira', status: TaskStatus.TODO, sortOrder: 0 });
    expect(tasks[0].dueAt).toEqual(new Date('2026-11-03T08:00:00.000Z'));
    expect(tasks[1]).toMatchObject({ status: TaskStatus.BLOCKED, dependsOn: ['task-1'], dueAt: null, assigneeRole: Role.COACH });
  });

  it('starts automations without dependencies immediately', () => {
    const [hook] = instantiate([def('hook', [], { type: TaskType.AUTOMATION, automation: { kind: 'WEBHOOK', url: 'https://x.y' } })]);
    expect(hook.status).toBe(TaskStatus.IN_PROGRESS);
    expect(hook.startedAt).toEqual(NOW);
  });

  it('unblocks a diamond only when every branch is finished (SKIPPED counts as finished)', () => {
    const tasks = instantiate([
      def('alarm'),
      def('lights', ['alarm']),
      def('lockers', ['lights']),
      def('cardio', ['lights']),
      def('desk', ['lockers', 'cardio']),
    ]);
    expect(statusOf(tasks)).toEqual({
      alarm: 'TODO',
      lights: 'BLOCKED',
      lockers: 'BLOCKED',
      cardio: 'BLOCKED',
      desk: 'BLOCKED',
    });
    expect(finish(tasks, 'alarm')).toEqual(['lights']);
    expect(finish(tasks, 'lights').sort()).toEqual(['cardio', 'lockers']);
    expect(finish(tasks, 'lockers')).toEqual([]);
    expect(statusOf(tasks).desk).toBe('BLOCKED');
    expect(finish(tasks, 'cardio', TaskStatus.SKIPPED)).toEqual(['desk']);
    expect(statusOf(tasks).desk).toBe('TODO');
  });

  it('turns an unblocked automation into a running one', () => {
    const tasks = instantiate([
      def('call'),
      def('hook', ['call'], { type: TaskType.AUTOMATION, automation: { kind: 'WEBHOOK', url: 'https://x.y' } }),
    ]);
    expect(finish(tasks, 'call')).toEqual(['hook']);
    expect(tasks[1]).toMatchObject({ status: TaskStatus.IN_PROGRESS, startedAt: NOW });
  });

  it('completes a run only when no task is open', () => {
    const tasks = instantiate([def('a'), def('b', ['a'])]);
    expect(isRunComplete(tasks.map((t) => t.status))).toBe(false);
    finish(tasks, 'a');
    expect(isRunComplete(tasks.map((t) => t.status))).toBe(false);
    finish(tasks, 'b', TaskStatus.SKIPPED);
    expect(isRunComplete(tasks.map((t) => t.status))).toBe(true);
    expect(isRunComplete([TaskStatus.DONE, TaskStatus.FAILED])).toBe(false);
  });

  it('treats a dependency that no longer exists as finished', () => {
    const candidate = { id: 'x', type: TaskType.MANUAL, status: TaskStatus.BLOCKED, dependsOn: ['gone'], dueInHours: null, dueAt: null, startedAt: null };
    expect(planUnblock([candidate], new Map())).toEqual(['x']);
  });

  it('only lets people make meaningful status changes', () => {
    const manual = TaskType.MANUAL;
    expect(() => assertTransition({ type: manual, from: TaskStatus.TODO, to: TaskStatus.DONE, blockingTitles: [] })).not.toThrow();
    expect(() => assertTransition({ type: manual, from: TaskStatus.BLOCKED, to: TaskStatus.SKIPPED, blockingTitles: ['A'] })).not.toThrow();
    expect(() => assertTransition({ type: manual, from: TaskStatus.BLOCKED, to: TaskStatus.DONE, blockingTitles: ['Appel'] })).toThrow(
      new ConflictException('Tâche bloquée par : « Appel ».'),
    );
    expect(() => assertTransition({ type: manual, from: TaskStatus.TODO, to: TaskStatus.BLOCKED, blockingTitles: [] })).toThrow(BadRequestException);
    expect(() => assertTransition({ type: manual, from: TaskStatus.TODO, to: TaskStatus.FAILED, blockingTitles: [] })).toThrow(BadRequestException);
    const automation = TaskType.AUTOMATION;
    expect(() => assertTransition({ type: automation, from: TaskStatus.FAILED, to: TaskStatus.SKIPPED, blockingTitles: [] })).not.toThrow();
    expect(() => assertTransition({ type: automation, from: TaskStatus.FAILED, to: TaskStatus.TODO, blockingTitles: [] })).toThrow(BadRequestException);
    expect(() => assertTransition({ type: automation, from: TaskStatus.IN_PROGRESS, to: TaskStatus.DONE, blockingTitles: [] })).toThrow(ConflictException);
  });

  it('flags open tasks past their due date only', () => {
    const past = new Date(NOW.getTime() - 1000);
    expect(isOverdue(TaskStatus.TODO, past, NOW)).toBe(true);
    expect(isOverdue(TaskStatus.BLOCKED, past, NOW)).toBe(true);
    expect(isOverdue(TaskStatus.DONE, past, NOW)).toBe(false);
    expect(isOverdue(TaskStatus.TODO, null, NOW)).toBe(false);
  });

  it('shows the board per role: admin all, others their role, themselves or unassigned', () => {
    const coachTask = { assigneeRole: Role.COACH, assigneeEmployeeId: null };
    const personal = { assigneeRole: null, assigneeEmployeeId: 'emp-7' };
    const unassigned = { assigneeRole: null, assigneeEmployeeId: null };
    expect(isVisibleTo(coachTask, { role: Role.ADMIN })).toBe(true);
    expect(isVisibleTo(coachTask, { role: Role.COACH })).toBe(true);
    expect(isVisibleTo(coachTask, { role: Role.STAFF })).toBe(false);
    expect(isVisibleTo(personal, { role: Role.STAFF, employeeId: 'emp-7' })).toBe(true);
    expect(isVisibleTo(personal, { role: Role.STAFF, employeeId: 'emp-8' })).toBe(false);
    expect(isVisibleTo(personal, { role: Role.STAFF })).toBe(false);
    expect(isVisibleTo(unassigned, { role: Role.COACH })).toBe(true);
  });

  describe('scoped viewer (coach)', () => {
    const coach = { role: Role.COACH };
    const staffTask = { id: 'staff-1', title: 'Appel de bienvenue à Amira', assigneeRole: Role.STAFF, assigneeEmployeeId: null };
    const otherStaffTask = { ...staffTask, id: 'staff-2', title: 'Encaisser le paiement' };
    const coachTask = { id: 'coach-1', title: 'Programme initial', assigneeRole: Role.COACH, assigneeEmployeeId: null };
    const unassigned = { id: 'hook-1', title: 'Prévenir n8n', assigneeRole: null, assigneeEmployeeId: null };

    it('links only the tasks a coach can see, but keeps the links the task already had', () => {
      expect(canLinkTo(coachTask, coach)).toBe(true);
      expect(canLinkTo(unassigned, coach)).toBe(true);
      expect(canLinkTo(staffTask, coach)).toBe(false);
      expect(canLinkTo(staffTask, coach, ['staff-1'])).toBe(true);
      expect(canLinkTo(staffTask, coach, ['staff-2'])).toBe(false);
      // ADMIN and STAFF are not scoped: no viewer, anything goes.
      expect(canLinkTo(staffTask)).toBe(true);
    });

    it('never names a task the coach cannot see in an error message', () => {
      expect(titlesFor([staffTask, coachTask])).toEqual(['Appel de bienvenue à Amira', 'Programme initial']);
      expect(titlesFor([staffTask, coachTask, otherStaffTask], coach)).toEqual([HIDDEN_TASK_TITLE, 'Programme initial']);
      expect(() =>
        assertTransition({ type: TaskType.MANUAL, from: TaskStatus.BLOCKED, to: TaskStatus.DONE, blockingTitles: titlesFor([staffTask], coach) }),
      ).toThrow(new ConflictException("Tâche bloquée par : « tâche d'une autre équipe »."));
    });

    const taskDto = (id: string, assigneeRole: Role | null): TaskDto => ({
      id,
      runId: 'run-1',
      runTitle: 'Onboarding — Amira',
      workflowId: 'wf-1',
      defId: id,
      title: id,
      description: null,
      type: TaskType.MANUAL,
      status: TaskStatus.TODO,
      assigneeRole,
      assigneeEmployeeId: null,
      assigneeName: null,
      dependsOn: [],
      dueAt: null,
      isOverdue: false,
      startedAt: null,
      completedAt: null,
      completedByName: null,
      notes: null,
      output: null,
      createdAt: NOW.toISOString(),
    });
    const runOf = (tasks: TaskDto[]): WorkflowRunDto => ({
      id: 'run-1',
      workflowId: 'wf-1',
      workflowName: 'Onboarding',
      title: 'Onboarding — Amira',
      status: WorkflowRunStatus.RUNNING,
      context: { firstName: 'Amira', phone: '+216 20 000 000' },
      startedByName: null,
      startedAt: NOW.toISOString(),
      completedAt: null,
      progress: { done: 1, total: tasks.length },
      tasks,
    });

    it('shows a coach only their tasks of a run, without the context, and nothing when none is theirs', () => {
      const run = runOf([taskDto('call', Role.STAFF), taskDto('program', Role.COACH), taskDto('hook', null), taskDto('pay', Role.ADMIN)]);
      expect(runForViewer(run)).toBe(run);
      expect(runForViewer(run, { role: Role.ADMIN })).toBe(run);
      const scoped = runForViewer(run, coach);
      expect(scoped?.tasks?.map((task) => task.id)).toEqual(['program', 'hook']);
      expect(scoped).toMatchObject({ id: 'run-1', title: 'Onboarding — Amira', context: null, progress: { done: 1, total: 4 } });
      expect(run.context).toEqual({ firstName: 'Amira', phone: '+216 20 000 000' });
      expect(runForViewer(runOf([taskDto('call', Role.STAFF), taskDto('pay', Role.ADMIN)]), coach)).toBeNull();
      expect(runForViewer(runOf([]), coach)).toBeNull();
    });
  });
});
