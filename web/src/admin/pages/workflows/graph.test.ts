import { describe, expect, it } from 'vitest';
import { autoLayout, createsCycle, NODE_HEIGHT, NODE_WIDTH } from './graph';

/** dependsOn map from "task: dependencies" pairs. */
const deps = (links: Record<string, string[]>) => new Map(Object.entries(links));

describe('createsCycle (edge source → target: target waits for source)', () => {
  it('refuses a task waiting for itself', () => {
    expect(createsCycle(deps({}), 'clean', 'clean')).toBe(true);
  });

  it('refuses a link back to a task that already waits for it', () => {
    // open → clean: "clean" waits for "open"; clean → open would close the loop.
    expect(createsCycle(deps({ clean: ['open'] }), 'clean', 'open')).toBe(true);
  });

  it('refuses a loop through several tasks', () => {
    const chain = deps({ clean: ['open'], check: ['clean'], close: ['check'] });
    expect(createsCycle(chain, 'close', 'open')).toBe(true);
  });

  it('accepts links that keep the graph acyclic, shortcuts included', () => {
    const chain = deps({ clean: ['open'], check: ['clean'] });
    expect(createsCycle(chain, 'open', 'check')).toBe(false);
    expect(createsCycle(chain, 'open', 'report')).toBe(false);
  });

  it('accepts joining two branches into one task (diamond)', () => {
    const diamond = deps({ cardio: ['open'], weights: ['open'] });
    expect(createsCycle(diamond, 'cardio', 'close')).toBe(false);
    expect(createsCycle(deps({ cardio: ['open'], weights: ['open'], close: ['cardio'] }), 'weights', 'close')).toBe(false);
  });

  it('terminates on data that already contains a loop', () => {
    expect(createsCycle(deps({ a: ['b'], b: ['a'] }), 'a', 'c')).toBe(false);
  });
});

describe('autoLayout', () => {
  it('puts tasks without dependencies in the first column', () => {
    const layout = autoLayout([{ id: 'open', dependsOn: [] }]);
    expect(layout.get('open')).toEqual({ x: 0, y: 0 });
  });

  it('places a task one column after its latest dependency', () => {
    const layout = autoLayout([
      { id: 'close', dependsOn: ['open', 'check'] },
      { id: 'check', dependsOn: ['open'] },
      { id: 'open', dependsOn: [] },
    ]);
    const x = (id: string) => layout.get(id)!.x;
    expect(x('open')).toBe(0);
    expect(x('check')).toBeGreaterThanOrEqual(NODE_WIDTH);
    expect(x('close') - x('check')).toBe(x('check') - x('open'));
  });

  it('stacks the tasks of a column without overlap, centred on the first row', () => {
    const layout = autoLayout([
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: [] },
      { id: 'c', dependsOn: [] },
    ]);
    const ys = ['a', 'b', 'c'].map((id) => layout.get(id)!.y);
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(NODE_HEIGHT);
    expect(ys[0] + ys[1] + ys[2]).toBe(0);
  });

  it('ignores links to tasks that are not on the graph', () => {
    const layout = autoLayout([{ id: 'open', dependsOn: ['deleted-task'] }]);
    expect(layout.get('open')).toEqual({ x: 0, y: 0 });
  });

  it('positions every task even when the data contains a loop', () => {
    const layout = autoLayout([
      { id: 'a', dependsOn: ['b'] },
      { id: 'b', dependsOn: ['a'] },
    ]);
    expect([...layout.keys()].sort()).toEqual(['a', 'b']);
  });

  it('returns an empty layout for an empty workflow', () => {
    expect(autoLayout([]).size).toBe(0);
  });
});
