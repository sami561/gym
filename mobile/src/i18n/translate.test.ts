import { describe, expect, it } from '@jest/globals';
import { isRTLLang, LANGUAGES, translate, type TranslationKey } from '@/i18n';

describe('translate', () => {
  it('looks nested keys up in the chosen language', () => {
    expect(translate('fr', 'common.retry')).toBe('Réessayer');
    expect(translate('en', 'common.retry')).toBe('Try again');
    expect(translate('ar', 'common.retry')).toBe('إعادة المحاولة');
    expect(translate('en', 'classes.status.LATE_CANCELLED')).toBe('Late cancellation');
  });

  it('fills every {placeholder}, numbers included', () => {
    expect(translate('fr', 'home.greeting', { name: 'Sami' })).toBe('Salut, Sami');
    expect(translate('en', 'classes.spots', { booked: 4, capacity: 10 })).toBe('4/10 spots');
    expect(translate('ar', 'classes.spots', { booked: 4, capacity: 10 })).toBe('الأماكن: 4/10');
    expect(translate('en', 'history.from', { from: '1 Oct', to: '31 Oct' })).toBe('From 1 Oct to 31 Oct');
  });

  it('fills zero and empty values', () => {
    expect(translate('en', 'classes.spotsLeft', { count: 0 })).toBe('0 spots left');
    expect(translate('fr', 'home.greeting', { name: '' })).toBe('Salut, ');
  });

  it('leaves a missing parameter visible instead of printing "undefined"', () => {
    expect(translate('en', 'home.greeting')).toBe('Hi, {name}');
    expect(translate('en', 'classes.strikesInfo', { count: 2 })).toBe('2/{limit} no-shows or late cancellations in 30 days');
  });

  it('ignores parameters the text does not use', () => {
    expect(translate('en', 'common.retry', { count: 3 })).toBe('Try again');
  });

  it('does not interpret $ patterns in values', () => {
    expect(translate('en', 'home.greeting', { name: "$& $' $1" })).toBe("Hi, $& $' $1");
  });

  it('falls back to the key for an unknown key or a whole section', () => {
    expect(translate('fr', 'common.unknown' as TranslationKey)).toBe('common.unknown');
    expect(translate('fr', 'classes.status' as TranslationKey)).toBe('classes.status');
    expect(translate('fr', 'common.toString' as TranslationKey)).toBe('common.toString');
  });
});

describe('languages', () => {
  it('offers French (the default), English and Arabic, each named in its own language', () => {
    expect(LANGUAGES).toEqual([
      { value: 'fr', label: 'Français' },
      { value: 'en', label: 'English' },
      { value: 'ar', label: 'العربية' },
    ]);
  });

  it('lays out Arabic only right-to-left', () => {
    expect(LANGUAGES.filter(({ value }) => isRTLLang(value)).map(({ value }) => value)).toEqual(['ar']);
  });
});
