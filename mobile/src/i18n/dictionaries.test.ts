import { describe, expect, it } from '@jest/globals';
import { ar } from './ar';
import { en } from './en';
import { fr } from './fr';

interface Tree {
  [key: string]: string | Tree;
}

/** Every string of a dictionary by its dot path, e.g. "classes.status.BOOKED". */
function strings(tree: Tree, prefix = ''): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'string') result.set(prefix + key, value);
    else for (const [path, text] of strings(value, `${prefix}${key}.`)) result.set(path, text);
  }
  return result;
}

/** Names of the {placeholders} interpolate() fills in (./index.tsx). */
function placeholders(text: string): string {
  return [...new Set(Array.from(text.matchAll(/\{(\w+)\}/g), (match) => match[1]))].sort().join(', ');
}

const reference = strings(fr);
const dictionaries = { fr: reference, en: strings(en), ar: strings(ar) };

describe.each(['en', 'ar'] as const)('%s dictionary', (lang) => {
  const dictionary = dictionaries[lang];

  it('has every key of the French reference and no other', () => {
    expect([...reference.keys()].filter((key) => !dictionary.has(key))).toEqual([]);
    expect([...dictionary.keys()].filter((key) => !reference.has(key))).toEqual([]);
  });

  it('uses the same {placeholders} as French in every string', () => {
    const mismatches = [...reference]
      .filter(([key, text]) => dictionary.has(key) && placeholders(dictionary.get(key) ?? '') !== placeholders(text))
      .map(([key, text]) => `${key}: fr {${placeholders(text)}}, ${lang} {${placeholders(dictionary.get(key) ?? '')}}`);
    expect(mismatches).toEqual([]);
  });
});

describe.each(['fr', 'en', 'ar'] as const)('%s strings', (lang) => {
  const entries = [...dictionaries[lang]];
  const keysWhere = (test: (text: string) => boolean) => entries.filter(([, text]) => test(text)).map(([key]) => key);

  it('are neither empty nor padded with spaces', () => {
    expect(keysWhere((text) => !text.trim() || text !== text.trim())).toEqual([]);
  });

  it('only use braces for {placeholders}', () => {
    // "{ count }" or "{count" would be shown to the member as is.
    expect(keysWhere((text) => /[{}]/.test(text.replace(/\{\w+\}/g, '')))).toEqual([]);
  });

  it('write numbers with Latin digits, like the formatters', () => {
    expect(keysWhere((text) => /[٠-٩۰-۹]/.test(text))).toEqual([]);
  });
});

describe('Arabic dictionary', () => {
  // Kept in Latin script on purpose: an e-mail example and a payment brand.
  const LATIN_ON_PURPOSE = new Set(['auth.emailPlaceholder', 'history.paymentMethods.D17']);

  it('is written in Arabic script, apart from examples and brand names', () => {
    const untranslated = [...dictionaries.ar]
      .filter(([key, text]) => !LATIN_ON_PURPOSE.has(key) && !/[\u0600-\u06ff]/.test(text))
      .map(([key, text]) => `${key}: ${text}`);
    expect(untranslated).toEqual([]);
  });
});
