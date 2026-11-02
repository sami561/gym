import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { landingAr, landingEn, landingFr, type LandingKey } from './landing';
import { admin } from './messages/admin';
import { core } from './messages/core';

const ARABIC_SCRIPT = /\p{Script=Arabic}/u;
const NON_LATIN_DIGIT = /(?![0-9])\p{Nd}/u;

/** Sorted placeholder names: "{n} sur {total}" → ["n", "total"]. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

const samePlaceholders = (a: string, b: string) => placeholders(a).join() === placeholders(b).join();

describe('back-office dictionary', () => {
  const entries = Object.entries(admin as Record<string, { en: string; ar: string }>);
  // Written the same in every language on purpose: HTTP verbs, the D17 wallet, cron syntax, arrows.
  const latinInArabic = new Set(['GET', 'POST', 'D17', 'Cron « {cron} »', '{start} → {end}']);

  it('has an English and an Arabic text for every message', () => {
    const missing = entries.filter(([, text]) => !text.en.trim() || !text.ar.trim()).map(([key]) => key);
    expect(missing).toEqual([]);
  });

  it('keeps the placeholders of the French text in every translation', () => {
    const broken = entries
      .filter(([key, text]) => !samePlaceholders(key, text.en) || !samePlaceholders(key, text.ar))
      .map(([key]) => key);
    expect(broken).toEqual([]);
  });

  it('writes Arabic in Arabic script, with Latin digits', () => {
    const notArabic = entries.filter(([key, text]) => !latinInArabic.has(key) && !ARABIC_SCRIPT.test(text.ar)).map(([key]) => key);
    const easternDigits = entries.filter(([, text]) => NON_LATIN_DIGIT.test(text.ar)).map(([key]) => key);
    expect(notArabic).toEqual([]);
    expect(easternDigits).toEqual([]);
  });

  it('has no Arabic in the English copy', () => {
    expect(entries.filter(([, text]) => ARABIC_SCRIPT.test(text.en)).map(([key]) => key)).toEqual([]);
  });

  it('gives the core strings (public site bundle) the same text as the back-office copy', () => {
    for (const [key, text] of Object.entries(core)) {
      expect(admin[key as keyof typeof admin], key).toEqual(text);
    }
  });

  // The generic 'Nom' ("Name") is الاسم in Arabic, like 'Prénom': last-name fields use their own key.
  it('labels first and last name differently in every language', () => {
    expect(admin['Prénom'].en).not.toBe(admin['Nom de famille'].en);
    expect(admin['Prénom'].ar).not.toBe(admin['Nom de famille'].ar);
  });

  it('names the last name as the public site does', () => {
    expect(admin['Nom de famille']).toEqual({ en: landingEn['trial.lastName'], ar: landingAr['trial.lastName'] });
  });

  // Member, lead, team and employee forms: a line that labels a lastName field must use that key.
  it('labels every last-name field of the back office with it', () => {
    const pages = new URL('../admin/', import.meta.url);
    const labelled = readdirSync(pages, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.tsx'))
      .flatMap((file) => readFileSync(new URL(file, pages), 'utf8').split('\n'))
      .filter((line) => line.includes('lastName') && /\blabel[=:]/.test(line));
    expect(labelled.length).toBeGreaterThan(0);
    expect(labelled.filter((line) => !line.includes("'Nom de famille'"))).toEqual([]);
  });
});

describe('public site dictionary', () => {
  const keys = Object.keys(landingFr) as LandingKey[];
  const storeNames = new Set<LandingKey>(['app.store', 'app.play']);

  it('translates every French key, and only those, in English and Arabic', () => {
    expect(Object.keys(landingEn).sort()).toEqual([...keys].sort());
    expect(Object.keys(landingAr).sort()).toEqual([...keys].sort());
    const empty = keys.filter((key) => !landingFr[key].trim() || !landingEn[key].trim() || !landingAr[key].trim());
    expect(empty).toEqual([]);
  });

  it('keeps the placeholders of the French text', () => {
    const broken = keys.filter((key) => !samePlaceholders(landingFr[key], landingEn[key]) || !samePlaceholders(landingFr[key], landingAr[key]));
    expect(broken).toEqual([]);
  });

  it('writes Arabic in Arabic script, with Latin digits', () => {
    expect(keys.filter((key) => !storeNames.has(key) && !ARABIC_SCRIPT.test(landingAr[key]))).toEqual([]);
    expect(keys.filter((key) => NON_LATIN_DIGIT.test(landingAr[key]))).toEqual([]);
    expect(keys.filter((key) => ARABIC_SCRIPT.test(landingEn[key]))).toEqual([]);
  });
});
