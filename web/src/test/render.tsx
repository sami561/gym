import type { ReactElement } from 'react';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { I18nProvider, type Lang } from '../i18n';
import { registerMessages } from '../i18n/messages';
import { admin } from '../i18n/messages/admin';
import { setFormatLocale } from '../lib/format';
import { memoryStorage } from './storage';

// Back-office components read the admin copy, registered by AdminApp in the real app.
registerMessages(admin);

// Fresh storage for every test. Also keeps jsdom tests working on Node 25+, whose own
// experimental localStorage global hides jsdom's.
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

// Testing Library only unmounts by itself when test globals are on; they are off here.
afterEach(() => {
  cleanup();
  setFormatLocale('fr');
  document.documentElement.removeAttribute('lang');
  document.documentElement.removeAttribute('dir');
});

/** Renders inside the i18n provider, started in `lang` through the saved preference. */
export function renderInLang(ui: ReactElement, lang: Lang = 'fr') {
  localStorage.setItem('meliora.lang', lang);
  return render(<I18nProvider>{ui}</I18nProvider>);
}
