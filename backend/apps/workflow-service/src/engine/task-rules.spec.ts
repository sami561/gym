import { BadRequestException, ConflictException } from '@nestjs/common';
import { Role, TaskStatus, TaskType, WorkflowTaskDef } from '@app/common';
import {
  InstantiatedTask,
  activate,
  assertTransition,
  instantiateTasks,
  isOverdue,
  isRunComplete,
  isVisibleTo,
  planUnblock,
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
});
