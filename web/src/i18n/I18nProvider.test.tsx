// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { currentLang, I18nProvider, LanguageSwitcher, useI18n } from './index';
import * as legacy from '../lib/i18n';
import { currencySymbol, formatTND } from '../lib/format';
import { renderInLang } from '../test/render';
import { blockedStorage } from '../test/storage';

function Probe() {
  const { lang, dir, t, setLang } = useI18n();
  return (
    <div>
      <output aria-label="state">{`${lang} ${dir}`}</output>
      <p>{t('nav.trial')}</p>
      <button type="button" onClick={() => setLang('ar')}>
        switch
      </button>
    </div>
  );
}

const state = () => screen.getByLabelText('state').textContent;
const html = () => [document.documentElement.lang, document.documentElement.dir];

function browserLanguages(languages: string[]) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
}

function renderProvider() {
  return render(
    <I18nProvider>
      <Probe />
    </I18nProvider>,
  );
}

describe('language detection', () => {
  it('uses the saved choice before the browser languages', () => {
    localStorage.setItem('meliora.lang', 'ar');
    browserLanguages(['en-US', 'en']);
    renderProvider();
    expect(state()).toBe('ar rtl');
  });

  it('ignores an unknown saved value', () => {
    localStorage.setItem('meliora.lang', 'de');
    browserLanguages(['en-US', 'fr']);
    renderProvider();
    expect(state()).toBe('en ltr');
  });

  it('takes the first supported browser language, whatever the region', () => {
    browserLanguages(['de-DE', 'ar-TN', 'en']);
    renderProvider();
    expect(state()).toBe('ar rtl');
  });

  it('falls back to French', () => {
    browserLanguages(['de-DE', 'it']);
    renderProvider();
    expect(state()).toBe('fr ltr');
  });

  it('still works when the browser blocks storage', () => {
    vi.stubGlobal('localStorage', blockedStorage());
    browserLanguages(['en-GB']);
    renderProvider();
    expect(state()).toBe('en ltr');
    fireEvent.click(screen.getByRole('button', { name: 'switch' }));
    expect(state()).toBe('ar rtl');
  });
});

describe('I18nProvider', () => {
  it('sets <html lang dir>, right-to-left in Arabic, and remembers the choice', () => {
    renderInLang(<Probe />, 'fr');
    expect(html()).toEqual(['fr', 'ltr']);
    expect(screen.getByText('Essai gratuit')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'switch' }));

    expect(html()).toEqual(['ar', 'rtl']);
    expect(screen.getByText('حصة مجانية')).toBeTruthy();
    expect(localStorage.getItem('meliora.lang')).toBe('ar');
  });

  it('switches money formats and the language used outside React (API errors)', () => {
    renderInLang(<Probe />, 'en');
    expect(currentLang()).toBe('en');
    expect(formatTND(1)).toBe('1.000 DT');

    fireEvent.click(screen.getByRole('button', { name: 'switch' }));

    expect(currentLang()).toBe('ar');
    expect(currencySymbol()).toBe('د.ت');
    expect(formatTND(1)).toBe('1,000 د.ت');
  });

  it('refuses to render a consumer outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useI18n must be used inside <I18nProvider>');
  });

  it('is still reachable through the old src/lib/i18n path', () => {
    expect(legacy.I18nProvider).toBe(I18nProvider);
    expect(legacy.useI18n).toBe(useI18n);
  });
});

describe('LanguageSwitcher', () => {
  it('marks the current language and switches on click', () => {
    renderInLang(<LanguageSwitcher />, 'fr');
    const pressed = () => screen.getAllByRole('button').map((button) => button.getAttribute('aria-pressed'));
    expect(screen.getByRole('group', { name: 'Langue' })).toBeTruthy();
    expect(pressed()).toEqual(['true', 'false', 'false']);

    fireEvent.click(screen.getByRole('button', { name: 'English' }));

    expect(pressed()).toEqual(['false', 'true', 'false']);
    expect(screen.getByRole('group', { name: 'Language' })).toBeTruthy();
    expect(html()).toEqual(['en', 'ltr']);
  });

  it('labels each language in its own language for screen readers', () => {
    renderInLang(<LanguageSwitcher />, 'fr');
    const arabic = screen.getByRole('button', { name: 'العربية' });
    expect(arabic.getAttribute('lang')).toBe('ar');
    expect(arabic.textContent).toBe('ع');
  });
});
