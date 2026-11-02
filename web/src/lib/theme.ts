import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'dark' | 'light';
const KEY = 'meliora.theme';

function readTheme(): ThemeMode {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Back-office light/dark switch. The public site is always dark. */
export function useAdminTheme() {
  const [theme, setTheme] = useState<ThemeMode>(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    return () => {
      document.documentElement.dataset.theme = 'dark';
    };
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* preference not persisted */
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}

/** Current back-office theme, kept in sync with <html data-theme> (read-only). */
export function useThemeMode(): ThemeMode {
  const [mode, setMode] = useState<ThemeMode>(() => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'));
  useEffect(() => {
    const observer = new MutationObserver(() => setMode(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return mode;
}
