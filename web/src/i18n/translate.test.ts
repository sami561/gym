import { beforeAll, describe, expect, it, vi } from 'vitest';
import { currentLang, translate, type TKey } from './index';
import { registerMessages } from './messages';
import { admin } from './messages/admin';

beforeAll(() => registerMessages(admin));

describe('translate', () => {
  it('reads public-site keys from the dictionary of each language', () => {
    expect(translate('fr', 'nav.trial')).toBe('Essai gratuit');
    expect(translate('en', 'nav.trial')).toBe('Free trial');
    expect(translate('ar', 'nav.trial')).toBe('حصة مجانية');
  });

  it('uses the French text as the back-office key', () => {
    expect(translate('fr', 'Se déconnecter')).toBe('Se déconnecter');
    expect(translate('en', 'Se déconnecter')).toBe('Sign out');
    expect(translate('ar', 'Se déconnecter')).toBe('تسجيل الخروج');
  });

  it('shows text without a translation as is (names, data)', () => {
    expect(translate('en', 'Salle Khzema 2' as TKey)).toBe('Salle Khzema 2');
    expect(translate('ar', 'Salle Khzema 2' as TKey)).toBe('Salle Khzema 2');
  });

  it('fills placeholders with strings and numbers', () => {
    expect(translate('en', 'Du {from} au {to}', { from: '1 Mar', to: '7 Mar' })).toBe('From 1 Mar to 7 Mar');
    expect(translate('ar', '{from}–{to} sur {total}', { from: 1, to: 20, total: 45 })).toBe('1–20 من 45');
  });

  it('keeps zero and empty values', () => {
    expect(translate('fr', 'Casier {n}', { n: 0 })).toBe('Casier 0');
    expect(translate('en', 'Supprimer {name} ?', { name: '' })).toBe('Delete ?');
  });

  it('leaves a placeholder visible when its value is missing', () => {
    expect(translate('fr', 'Du {from} au {to}', { from: 'lundi' })).toBe('Du lundi au {to}');
    expect(translate('fr', 'Du {from} au {to}')).toBe('Du {from} au {to}');
  });

  it('inserts values literally, in a single pass', () => {
    // "$&" is a replacement pattern for String.replace; a value must never be read as one.
    expect(translate('fr', 'Supprimer {name} ?', { name: 'Promo $& -50%' })).toBe('Supprimer Promo $& -50% ?');
    // A value that looks like a placeholder is not filled again.
    expect(translate('fr', 'Du {from} au {to}', { from: '{to}', to: 'dimanche' })).toBe('Du {to} au dimanche');
  });
});

describe('message registry', () => {
  it('ships the core strings with the public site and adds the back-office copy once registered', async () => {
    vi.resetModules();
    const i18n = await import('./index');
    const messages = await import('./messages');
    const { admin: adminCopy } = await import('./messages/admin');

    expect(i18n.translate('en', 'Annuler')).toBe('Cancel');
    // The /admin chunk has not loaded yet: the French source text is shown.
    expect(i18n.translate('en', 'Se déconnecter')).toBe('Se déconnecter');

    messages.registerMessages(adminCopy);
    expect(i18n.translate('en', 'Se déconnecter')).toBe('Sign out');
  });
});

describe('currentLang', () => {
  it('is French until a provider picks a language', () => {
    expect(currentLang()).toBe('fr');
  });
});
