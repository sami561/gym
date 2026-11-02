import { autoLayout, findCycle, layers, LAYOUT } from './graph';

describe('workflow graph', () => {
  it('finds no cycle in a diamond', () => {
    const nodes = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: ['a'] },
      { id: 'c', dependsOn: ['a'] },
      { id: 'd', dependsOn: ['b', 'c'] },
    ];
    expect(findCycle(nodes)).toBeNull();
  });

  it('returns the tasks forming a loop, closed on the first one', () => {
    const nodes = [
      { id: 'a', dependsOn: ['c'] },
      { id: 'b', dependsOn: ['a'] },
      { id: 'c', dependsOn: ['b'] },
      { id: 'x', dependsOn: [] },
    ];
    const cycle = findCycle(nodes)!;
    expect(cycle[0]).toBe(cycle[cycle.length - 1]);
    expect(new Set(cycle)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('detects a self-link and ignores unknown ids', () => {
    expect(findCycle([{ id: 'a', dependsOn: ['a'] }])).toEqual(['a', 'a']);
    expect(findCycle([{ id: 'a', dependsOn: ['ghost'] }])).toBeNull();
  });

  it('lays tasks out left to right by dependency depth, keeping given positions', () => {
    const nodes = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: ['a'] },
      { id: 'c', dependsOn: ['a'] },
      { id: 'd', dependsOn: ['b', 'c'], position: { x: 5, y: 6 } },
    ];
    expect(Object.fromEntries(layers(nodes))).toEqual({ a: 0, b: 1, c: 1, d: 2 });
    const laid = autoLayout(nodes);
    expect(laid[0].position).toEqual({ x: LAYOUT.originX, y: LAYOUT.originY });
    expect(laid[1].position).toEqual({ x: LAYOUT.originX + LAYOUT.columnWidth, y: LAYOUT.originY });
    expect(laid[2].position).toEqual({ x: LAYOUT.originX + LAYOUT.columnWidth, y: LAYOUT.originY + LAYOUT.rowHeight });
    expect(laid[3].position).toEqual({ x: 5, y: 6 });
  });
});
