import type { TaskStatus, WorkflowTaskDef } from '../../../api/types-ops';

export const NODE_WIDTH = 230;
export const NODE_HEIGHT = 96;

/** True when adding the edge source → target (target depends on source) would close a loop. */
export function createsCycle(dependsOn: Map<string, string[]>, source: string, target: string): boolean {
  if (source === target) return true;
  // A cycle appears if `source` already (transitively) depends on `target`.
  const stack = [source];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === target) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(dependsOn.get(current) ?? []));
  }
  return false;
}

/** Layered layout: a task sits one column after the latest task it depends on. */
export function autoLayout(tasks: Pick<WorkflowTaskDef, 'id' | 'dependsOn'>[]): Map<string, { x: number; y: number }> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const level = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (id: string): number => {
    if (level.has(id)) return level.get(id)!;
    if (visiting.has(id)) return 0; // defensive: cycles are rejected before save
    visiting.add(id);
    const deps = (byId.get(id)?.dependsOn ?? []).filter((d) => byId.has(d));
    const value = deps.length ? Math.max(...deps.map(depth)) + 1 : 0;
    visiting.delete(id);
    level.set(id, value);
    return value;
  };
  tasks.forEach((t) => depth(t.id));
  const columns = new Map<number, string[]>();
  tasks.forEach((t) => {
    const l = level.get(t.id) ?? 0;
    columns.set(l, [...(columns.get(l) ?? []), t.id]);
  });
  const positions = new Map<string, { x: number; y: number }>();
  columns.forEach((ids, l) => {
    const offset = ((ids.length - 1) * (NODE_HEIGHT + 40)) / 2;
    ids.forEach((id, i) => positions.set(id, { x: l * (NODE_WIDTH + 90), y: i * (NODE_HEIGHT + 40) - offset }));
  });
  return positions;
}

/** Status palette for run graphs: colour + label + icon, never colour alone. */
export const STATUS_STYLE: Record<TaskStatus, { ring: string; dot: string }> = {
  BLOCKED: { ring: 'ring-line', dot: 'bg-[var(--other)]' },
  TODO: { ring: 'ring-[var(--series-1)]', dot: 'bg-[var(--series-1)]' },
  IN_PROGRESS: { ring: 'ring-[#fab219]', dot: 'bg-[#fab219]' },
  DONE: { ring: 'ring-[#0ca30c]', dot: 'bg-[#0ca30c]' },
  SKIPPED: { ring: 'ring-line', dot: 'bg-[var(--other)]' },
  FAILED: { ring: 'ring-[#d03b3b]', dot: 'bg-[#d03b3b]' },
};

export function newTaskId(): string {
  return `task-${Math.random().toString(36).slice(2, 8)}`;
}
