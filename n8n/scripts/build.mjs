/* Writes workflows/*.json from scripts/workflows.mjs (templates inlined into the Code nodes). */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorkflows } from './workflows.mjs';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'workflows');
mkdirSync(out, { recursive: true });
for (const file of readdirSync(out)) if (file.endsWith('.json')) rmSync(join(out, file));

for (const { slug, json } of buildWorkflows()) {
  const path = join(out, `${slug}.json`);
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
  console.log(`✓ workflows/${slug}.json — ${json.nodes.length} nodes`);
}
