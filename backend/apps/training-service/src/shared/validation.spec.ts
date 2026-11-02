import { BadRequestException } from '@nestjs/common';
import {
  assertDateOnly,
  likePattern,
  optionalMetric,
  optionalText,
  parseInstant,
  requireAmount,
  requireInt,
  requireText,
} from './validation';

describe('training input validators (French messages)', () => {
  it('requires a non-blank text with the given message', () => {
    expect(requireText('  m-1 ', 'Le membre est obligatoire.')).toBe('m-1');
    for (const value of ['   ', undefined, 7]) {
      expect(() => requireText(value, 'Le membre est obligatoire.')).toThrow(new BadRequestException('Le membre est obligatoire.'));
    }
  });

  it('turns blank or non-text optional values into null', () => {
    expect(optionalText(' Genou fragile ')).toBe('Genou fragile');
    expect(optionalText('  ')).toBeNull();
    expect(optionalText(12)).toBeNull();
    expect(optionalText(undefined)).toBeNull();
  });

  it('accepts YYYY-MM-DD days only', () => {
    expect(assertDateOnly('2026-11-02', 'La date')).toBe('2026-11-02');
    for (const value of ['2026-11-02T10:00:00Z', '02/11/2026', '', null]) {
      expect(() => assertDateOnly(value, 'La date')).toThrow('La date doit être une date au format AAAA-MM-JJ.');
    }
  });

  it('reads instants and names the field of an unreadable one', () => {
    expect(parseInstant('2026-11-02T18:00:00+01:00', 'Début de séance').toISOString()).toBe('2026-11-02T17:00:00.000Z');
    expect(() => parseInstant('ce soir', 'Début de séance')).toThrow('Début de séance : date invalide.');
    expect(() => parseInstant(1_762_102_800_000, 'Début de séance')).toThrow('Début de séance : date invalide.');
  });

  describe('optionalMetric', () => {
    it('keeps empty values empty and rounds to 2 decimals', () => {
      expect(optionalMetric(undefined, 'Le poids (kg)', 20, 400)).toBeNull();
      expect(optionalMetric(null, 'Le poids (kg)', 20, 400)).toBeNull();
      expect(optionalMetric('', 'Le poids (kg)', 20, 400)).toBeNull();
      expect(optionalMetric('72.456', 'Le poids (kg)', 20, 400)).toBe(72.46);
    });

    it('includes both bounds and refuses values outside', () => {
      expect(optionalMetric(20, 'Le poids (kg)', 20, 400)).toBe(20);
      expect(optionalMetric(400, 'Le poids (kg)', 20, 400)).toBe(400);
      for (const value of [19.99, 400.01, 'lourd', Number.NaN]) {
        expect(() => optionalMetric(value, 'Le poids (kg)', 20, 400)).toThrow('Le poids (kg) doit être compris entre 20 et 400.');
      }
    });
  });

  it('requires whole numbers within bounds', () => {
    expect(requireInt('8', 'Le nombre de semaines', 1, 52)).toBe(8);
    for (const value of [0, 53, 2.5, 'huit']) {
      expect(() => requireInt(value, 'Le nombre de semaines', 1, 52)).toThrow('Le nombre de semaines doit être un entier entre 1 et 52.');
    }
  });

  it('requires a positive amount rounded to the millime', () => {
    expect(requireAmount('45.1234', 'Le prix')).toBe(45.123);
    expect(requireAmount(0, 'Le prix')).toBe(0);
    for (const value of [-1, 'gratuit', undefined]) {
      expect(() => requireAmount(value, 'Le prix')).toThrow('Le prix doit être un montant positif.');
    }
  });

  it('escapes LIKE wildcards in searches', () => {
    expect(likePattern(' squat_100% ')).toBe('%squat\\_100\\%%');
  });
});
