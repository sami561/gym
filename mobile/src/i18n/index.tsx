import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { storage, STORAGE_KEYS } from '@/lib/storage';
import { en } from './en';
import { Dictionary, fr } from './fr';

export type Lang = 'fr' | 'en';

const dictionaries: Record<Lang, Dictionary> = { fr, en };

/** Dot paths to every string of the dictionary, e.g. "home.greeting". */
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TranslationKey = Leaves<Dictionary>;
export type Params = Record<string, string | number>;

function lookup(dict: Dictionary, key: string): string {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], dict);
  return typeof value === 'string' ? value : key;
}

function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

interface I18nContextValue {
  lang: Lang;
  /** BCP-47 locale for Intl formatting. */
  locale: string;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey, params?: Params) => string;
  /** Pluralised "N day(s)". */
  days: (count: number) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('fr');

  useEffect(() => {
    storage.get(STORAGE_KEYS.lang).then((saved) => {
      if (saved === 'fr' || saved === 'en') setLangState(saved);
    });
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    storage.set(STORAGE_KEYS.lang, next).catch(() => undefined);
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const dict = dictionaries[lang];
    const t = (key: TranslationKey, params?: Params) => interpolate(lookup(dict, key), params);
    return {
      lang,
      locale: lang === 'fr' ? 'fr-FR' : 'en-GB',
      setLang,
      t,
      days: (count: number) =>
        interpolate(Math.abs(count) === 1 ? dict.common.days.one : dict.common.days.other, { count }),
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
