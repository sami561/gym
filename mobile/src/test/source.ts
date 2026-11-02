import { readdirSync, readFileSync } from './node';

// Set by Jest's module wrapper.
declare const __dirname: string;

const SRC = `${__dirname}/..`;

/** App source files under src/ (tests and test helpers left out), with paths relative to src/. */
export function appSources(): { path: string; text: string }[] {
  return readdirSync(SRC, { recursive: true })
    .map((path) => path.split('\\').join('/'))
    .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.startsWith('test/'))
    .sort()
    .map((path) => ({ path, text: readFileSync(`${SRC}/${path}`, 'utf8') }));
}

/**
 * Sorted top-level keys of the object literal opening at source[open], e.g. `{ n, date: f(x, { a }) }`
 * gives ['date', 'n']; null when a key cannot be read statically (spread, computed or quoted key).
 */
export function literalKeys(source: string, open: number): string[] | null {
  const entries: string[] = [];
  let depth = 0;
  let entry = '';
  for (let i = open; i < source.length; i++) {
    const char = source[i];
    if ('([{'.includes(char)) depth++;
    if (')]}'.includes(char)) depth--;
    if (depth === 0) break;
    if (depth === 1 && char === ',') {
      entries.push(entry);
      entry = '';
    } else if (i > open) {
      entry += char;
    }
  }
  entries.push(entry);
  const keys = entries
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => /^(\w+)\s*(?::|$)/.exec(text)?.[1] ?? null);
  return keys.every((key): key is string => key !== null) ? keys.sort() : null;
}
