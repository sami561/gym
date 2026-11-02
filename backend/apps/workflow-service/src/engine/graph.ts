/** Graph helpers over "task depends on tasks" links. Edges point from a task to its dependencies. */
export interface GraphNode {
  id: string;
  dependsOn: string[];
}

/**
 * Returns one cycle as a list of ids (first id repeated at the end), or null for a DAG.
 * Unknown dependency ids are ignored here (validated separately).
 */
export function findCycle(nodes: GraphNode[]): string[] | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    state.set(id, 'visiting');
    stack.push(id);
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      if (!byId.has(dep)) continue;
      if (state.get(dep) === 'visiting') return [...stack.slice(stack.indexOf(dep)), dep];
      if (!state.has(dep)) {
        const cycle = visit(dep);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  };

  for (const node of nodes) {
    if (state.has(node.id)) continue;
    const cycle = visit(node.id);
    if (cycle) return cycle;
  }
  return null;
}

/** Layer of each node = length of its longest dependency chain (roots are layer 0). Assumes a DAG. */
export function layers(nodes: GraphNode[]): Map<string, number> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const result = new Map<string, number>();
  const layerOf = (id: string): number => {
    const known = result.get(id);
    if (known !== undefined) return known;
    const deps = (byId.get(id)?.dependsOn ?? []).filter((dep) => byId.has(dep));
    const layer = deps.length ? 1 + Math.max(...deps.map(layerOf)) : 0;
    result.set(id, layer);
    return layer;
  };
  nodes.forEach((node) => layerOf(node.id));
  return result;
}

export const LAYOUT = { originX: 80, originY: 80, columnWidth: 280, rowHeight: 140 };

/** Left-to-right layout for nodes without a position: one column per layer. */
export function autoLayout<T extends GraphNode & { position?: { x: number; y: number } | null }>(nodes: T[]): T[] {
  const layerById = layers(nodes);
  const rowsUsed = new Map<number, number>();
  return nodes.map((node) => {
    const layer = layerById.get(node.id) ?? 0;
    const row = rowsUsed.get(layer) ?? 0;
    rowsUsed.set(layer, row + 1);
    if (node.position && Number.isFinite(node.position.x) && Number.isFinite(node.position.y)) return node;
    return {
      ...node,
      position: { x: LAYOUT.originX + layer * LAYOUT.columnWidth, y: LAYOUT.originY + row * LAYOUT.rowHeight },
    };
  });
}
