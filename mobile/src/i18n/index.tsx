import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getLocales } from 'expo-localization';
import { applyLayoutDirection, DirectionResult, syncLayoutDirection } from '@/lib/direction';
import { storage, STORAGE_KEYS } from '@/lib/storage';
import { ar } from './ar';
import { en } from './en';
import { Dictionary, fr } from './fr';

export type Lang = 'fr' | 'en' | 'ar';

/** Language picker entries, each written in its own language. */
export const LANGUAGES: { value: Lang; label: string }[] = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'العربية' },
];

const dictionaries: Record<Lang, Dictionary> = { fr, en, ar };

/** Intl locales: Tunisian Arabic formats with Western digits (as used in Tunisia). */
const INTL_LOCALES: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-TN-u-nu-latn' };

/** Dot paths to every string of the dictionary, e.g. "home.greeting". */
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TranslationKey = Leaves<Dictionary>;
export type Params = Record<string, string | number>;

function isLang(value: unknown): value is Lang {
  return value === 'fr' || value === 'en' || value === 'ar';
}

export function isRTLLang(lang: Lang): boolean {
  return lang === 'ar';
}

/** First device language we support, French otherwise. */
function deviceLanguage(): Lang {
  try {
    const supported = getLocales()
      .map((locale) => locale.languageCode)
      .find(isLang);
    return supported ?? 'fr';
  } catch {
    return 'fr';
  }
}

function lookup(dict: Dictionary, key: string): string {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], dict);
  return typeof value === 'string' ? value : key;
}

function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** Translate in a given language (e.g. a message shown right after switching). */
export function translate(lang: Lang, key: TranslationKey, params?: Params): string {
  return interpolate(lookup(dictionaries[lang], key), params);
}

interface I18nContextValue {
  lang: Lang;
  /** BCP-47 locale for Intl formatting. */
  locale: string;
  isRTL: boolean;
  /** Saves the language; switching to/from Arabic reloads the app to flip the layout direction. */
  setLang: (lang: Lang) => Promise<DirectionResult>;
  t: (key: TranslationKey, params?: Params) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang | null>(null);

  useEffect(() => {
    (async () => {
      const saved = await storage.get(STORAGE_KEYS.lang);
      const initial = isLang(saved) ? saved : deviceLanguage();
      setLangState(initial);
      await syncLayoutDirection(isRTLLang(initial));
    })();
  }, []);

  const setLang = useCallback(async (next: Lang) => {
    await storage.set(STORAGE_KEYS.lang, next).catch(() => undefined);
    setLangState(next);
    return applyLayoutDirection(isRTLLang(next));
  }, []);

  const value = useMemo<I18nContextValue | null>(() => {
    if (!lang) return null;
    return {
      lang,
      locale: INTL_LOCALES[lang],
      isRTL: isRTLLang(lang),
      setLang,
      t: (key: TranslationKey, params?: Params) => translate(lang, key, params),
    };
  }, [lang, setLang]);

  // Render nothing (the splash screen stays up) until the language is known: no French flash.
  if (!value) return null;
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
