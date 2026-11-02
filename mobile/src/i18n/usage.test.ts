import { describe, expect, it } from '@jest/globals';
import { appSources, literalKeys } from '@/test/source';
import { fr } from './fr';

interface Call {
  path: string;
  key: string;
  /** Parameter names passed, sorted; [] without parameters. */
  params: string[];
}

/** French text of a dot-path key, undefined when there is none. */
function frenchText(key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], fr);
  return typeof value === 'string' ? value : undefined;
}

function placeholders(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(/\{(\w+)\}/g), (match) => match[1]))].sort();
}

/** `t('a.b', {...})` and `translate(lang, 'a.b', {...})` calls with a literal key and literal (or no) parameters. */
function literalCalls(path: string, source: string): Call[] {
  const calls: Call[] = [];
  for (const match of source.matchAll(/\b(?:t|translate)\(\s*(?:\w+\s*,\s*)?(['"])([\w.]+)\1\s*([,)])/g)) {
    const [whole, , key, next] = match;
    if (next === ')') {
      calls.push({ path, key, params: [] });
      continue;
    }
    const after = match.index + whole.length;
    const open = after + source.slice(after).search(/\S/);
    if (source[open] !== '{') continue; // parameters in a variable: not checked
    const params = literalKeys(source, open);
    if (params) calls.push({ path, key, params });
  }
  return calls;
}

describe('translation calls in the app', () => {
  const calls = appSources().flatMap(({ path, text }) => literalCalls(path, text));

  it('are found by the scan, so the rule below does check something', () => {
    expect(calls.length).toBeGreaterThan(100);
    const sample =
      "t('home.greeting', { firstName: m.f }); t('classes.spots', { booked, capacity: f(a, { b }) }); " +
      "t('common.no'); t('a.b', params); t('a.c', { ...rest });";
    expect(literalCalls('x.tsx', sample)).toEqual([
      { path: 'x.tsx', key: 'home.greeting', params: ['firstName'] },
      { path: 'x.tsx', key: 'classes.spots', params: ['booked', 'capacity'] },
      { path: 'x.tsx', key: 'common.no', params: [] },
    ]);
  });

  it('pass exactly the {placeholders} their text uses', () => {
    // A missing parameter shows "{name}" to the member; an extra one usually means a renamed placeholder.
    const mismatches = calls
      .filter(({ key }) => frenchText(key) !== undefined)
      .filter(({ key, params }) => placeholders(frenchText(key) ?? '').join() !== params.join())
      .map(({ path, key, params }) => `${path}: ${key} gets {${params}}, its text uses {${placeholders(frenchText(key) ?? '')}}`);
    expect(mismatches).toEqual([]);
  });
});
