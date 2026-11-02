import { BadRequestException } from '@nestjs/common';
import { LeaveType } from '@app/common';
import {
  amount,
  dateOnly,
  dateTime,
  oneOf,
  optionalDateOnly,
  optionalText,
  period,
  requiredText,
  round2,
  round3,
} from './inputs';

describe('staff input validators (French messages)', () => {
  it('rounds hours to 2 decimals and money to 3', () => {
    expect(round2(90.33333)).toBe(90.33);
    expect(round3(1450.12345)).toBe(1450.123);
    expect(round3(0.1 + 0.2)).toBe(0.3);
  });

  describe('dateOnly', () => {
    it('accepts real calendar days, leap days included', () => {
      expect(dateOnly('2026-11-02', "Date d'embauche")).toBe('2026-11-02');
      expect(dateOnly('2028-02-29', "Date d'embauche")).toBe('2028-02-29');
    });

    it.each(['2026-02-29', '2026-04-31', '2026-13-01', '2026-11-2', '02/11/2026', '', 20261102, null])(
      'refuses %p naming the field',
      (value) => {
        expect(() => dateOnly(value, "Date d'embauche")).toThrow(
          new BadRequestException("Date d'embauche : date invalide (AAAA-MM-JJ attendu)."),
        );
      },
    );

    it('keeps "not sent" apart from "cleared"', () => {
      expect(optionalDateOnly(undefined, 'Date de fin')).toBeUndefined();
      expect(optionalDateOnly(null, 'Date de fin')).toBeNull();
      expect(optionalDateOnly('', 'Date de fin')).toBeNull();
      expect(optionalDateOnly('2026-12-31', 'Date de fin')).toBe('2026-12-31');
      expect(() => optionalDateOnly('31/12/2026', 'Date de fin')).toThrow('Date de fin : date invalide (AAAA-MM-JJ attendu).');
    });
  });

  describe('dateTime', () => {
    it('reads ISO strings and dates', () => {
      expect(dateTime('2026-11-02T07:30:00+01:00', 'Début').toISOString()).toBe('2026-11-02T06:30:00.000Z');
      const at = new Date('2026-11-02T06:30:00.000Z');
      expect(dateTime(at, 'Début')).toEqual(at);
    });

    it.each(['bientôt', 1_762_065_000_000, undefined, null])('refuses %p', (value) => {
      expect(() => dateTime(value, 'Début du créneau')).toThrow('Début du créneau : date/heure invalide.');
    });
  });

  describe('period', () => {
    it('accepts YYYY-MM months only', () => {
      expect(period('2026-11')).toBe('2026-11');
      for (const value of ['2026-13', '2026-00', '2026-1', '2026-11-01', 202611]) {
        expect(() => period(value)).toThrow(new BadRequestException('Période invalide (AAAA-MM attendu).'));
      }
    });
  });

  describe('amount', () => {
    it('accepts zero and positive numbers, rounded to the millime', () => {
      expect(amount(0, 'Les primes')).toBe(0);
      expect(amount(150.12345, 'Les primes')).toBe(150.123);
    });

    it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, '100', null])('refuses %p', (value) => {
      expect(() => amount(value, 'Les primes')).toThrow('Les primes doit être un nombre positif ou nul.');
    });
  });

  describe('texts and enums', () => {
    it('requires a non-blank text and trims it', () => {
      expect(requiredText('  Sami ', 'Le prénom')).toBe('Sami');
      for (const value of ['   ', '', undefined, 42]) {
        expect(() => requiredText(value, 'Le prénom')).toThrow('Le prénom est obligatoire.');
      }
    });

    it('turns blank optional texts into null and keeps undefined', () => {
      expect(optionalText(undefined)).toBeUndefined();
      expect(optionalText(null)).toBeNull();
      expect(optionalText('   ')).toBeNull();
      expect(optionalText(' Salle 2 ')).toBe('Salle 2');
      expect(optionalText(12)).toBe('12');
    });

    it('accepts only enum values', () => {
      expect(oneOf('UNPAID', LeaveType, 'Type de congé')).toBe(LeaveType.UNPAID);
      expect(() => oneOf('VACANCES', LeaveType, 'Type de congé')).toThrow(new BadRequestException('Type de congé invalide.'));
      expect(() => oneOf(undefined, LeaveType, 'Type de congé')).toThrow('Type de congé invalide.');
    });
  });
});
