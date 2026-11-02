import { describe, expect, it } from '@jest/globals';
import { appSources, literalKeys } from '@/test/source';
import { fontFor, fonts } from '@/theme';

const brandFonts = Object.values(fonts);

describe('fontFor', () => {
  it.each(['fr', 'en'])('keeps the brand fonts in %s', (lang) => {
    for (const family of brandFonts) expect(fontFor(family, lang)).toBe(family);
    expect(fontFor(undefined, lang)).toBeUndefined();
  });

  it('switches to Cairo in Arabic, keeping the weight', () => {
    expect(fontFor(fonts.regular, 'ar')).toBe('Cairo_400Regular');
    expect(fontFor(fonts.medium, 'ar')).toBe('Cairo_500Medium');
    expect(fontFor(fonts.semibold, 'ar')).toBe('Cairo_600SemiBold');
    expect(fontFor(fonts.bold, 'ar')).toBe('Cairo_700Bold');
    // Bebas Neue has no Arabic glyphs: display titles use bold Cairo.
    expect(fontFor(fonts.display, 'ar')).toBe('Cairo_700Bold');
  });

  it('never leaves Arabic text in a font without Arabic glyphs', () => {
    expect(fontFor(undefined, 'ar')).toBe('Cairo_400Regular');
    expect(fontFor('System', 'ar')).toBe('Cairo_400Regular');
  });
});

describe('font loading', () => {
  it('loads every font the theme can return before the first render', () => {
    const loaded = appSources().flatMap(({ text }) =>
      Array.from(text.matchAll(/useFonts\(\s*\{/g), (match) => literalKeys(text, match.index + match[0].length - 1) ?? []).flat(),
    );
    const arabic = [...brandFonts, undefined].map((family) => fontFor(family, 'ar') ?? '(none)');
    const used = [...new Set<string>([...brandFonts, ...arabic])];
    expect(loaded.length).toBeGreaterThan(0);
    expect(used.filter((family) => !loaded.includes(family))).toEqual([]);
  });
});
