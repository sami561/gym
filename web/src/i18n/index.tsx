import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { setFormatLocale } from '../lib/format';
import { landingAr, landingEn, landingFr, type LandingKey } from './landing';
import { MESSAGES, type MessageKey } from './messages';

export type Lang = 'fr' | 'en' | 'ar';
export type TranslationKey = LandingKey;
/** Landing keys ("hero.title1") or back-office French source text ("Membres actifs"). */
export type TKey = LandingKey | MessageKey;
export type TVars = Record<string, string | number>;

export const LANGS: { code: Lang; label: string; short: string }[] = [
  { code: 'fr', label: 'Français', short: 'FR' },
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'ar', label: 'العربية', short: 'ع' },
];

const LANDING: Record<Lang, Record<LandingKey, string>> = { fr: landingFr, en: landingEn, ar: landingAr };

let activeLang: Lang = 'fr';
/** Language currently shown, for code outside React (API error messages). */
export function currentLang(): Lang {
  return activeLang;
}
const STORAGE_KEY = 'meliora.lang';

export function translate(lang: Lang, key: TKey, vars?: TVars): string {
  let text: string;
  if (key in landingFr) text = LANDING[lang][key as LandingKey];
  else if (lang === 'fr') text = key;
  else text = (MESSAGES as Record<string, { en: string; ar: string }>)[key]?.[lang] ?? key;
  if (vars) text = text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
  return text;
}

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'fr' || saved === 'en' || saved === 'ar') return saved;
  } catch {
    /* storage unavailable */
  }
  const preferred = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  for (const tag of preferred) {
    const base = tag?.slice(0, 2).toLowerCase();
    if (base === 'fr' || base === 'en' || base === 'ar') return base;
  }
  return 'fr';
}

export type TFunction = (key: TKey, vars?: TVars) => string;

interface I18nValue {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  setLang: (lang: Lang) => void;
  t: TFunction;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  // Formatters (dates, money, numbers) read the locale while rendering.
  setFormatLocale(lang);
  activeLang = lang;

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* preference not persisted */
    }
  }, []);

  const value = useMemo<I18nValue>(() => ({ lang, dir, setLang, t: (key, vars) => translate(lang, key, vars) }), [lang, dir, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

export function useT(): TFunction {
  return useI18n().t;
}

/** FR / EN / ع switch, persisted. `tone="dark"` for the public site header. */
export function LanguageSwitcher({ tone = 'admin', className }: { tone?: 'dark' | 'admin'; className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t('a11y.lang')}
      className={clsx('flex rounded-full p-0.5 ring-1', tone === 'dark' ? 'ring-white/20' : 'ring-line', className)}
    >
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.code}
          title={l.label}
          aria-label={l.label}
          aria-pressed={lang === l.code}
          onClick={() => setLang(l.code)}
          className={clsx(
            'min-w-8 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
            lang === l.code
              ? tone === 'dark'
                ? 'bg-white text-black'
                : 'bg-fg text-page'
              : tone === 'dark'
                ? 'text-steel-300 hover:text-white'
                : 'text-fg-2 hover:text-fg',
          )}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}
