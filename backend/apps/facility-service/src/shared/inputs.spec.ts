import { BadRequestException } from '@nestjs/common';
import { TicketPriority } from '@app/common';
import { amount, dateOnly, dateTime, oneOf, optionalDateOnly, optionalText, period, requiredText, round2, round3 } from './inputs';

describe('facility input validators (French messages)', () => {
  it('rounds to 2 and 3 decimals', () => {
    expect(round2(12.3456)).toBe(12.35);
    expect(round3(1299.99951)).toBe(1300);
  });

  it('accepts real calendar days only', () => {
    expect(dateOnly('2028-02-29', "Date d'achat")).toBe('2028-02-29');
    for (const value of ['2027-02-29', '2026-06-31', '2026-6-1', 'hier', undefined]) {
      expect(() => dateOnly(value, "Date d'achat")).toThrow(new BadRequestException("Date d'achat : date invalide (AAAA-MM-JJ attendu)."));
    }
  });

  it('keeps "not sent" apart from "cleared" for optional days', () => {
    expect(optionalDateOnly(undefined, 'Fin de garantie')).toBeUndefined();
    expect(optionalDateOnly('', 'Fin de garantie')).toBeNull();
    expect(optionalDateOnly(null, 'Fin de garantie')).toBeNull();
    expect(optionalDateOnly('2027-12-31', 'Fin de garantie')).toBe('2027-12-31');
  });

  it('reads instants and months', () => {
    expect(dateTime('2026-11-02T08:00:00.000Z', 'Début').toISOString()).toBe('2026-11-02T08:00:00.000Z');
    expect(() => dateTime('plus tard', 'Début')).toThrow('Début : date/heure invalide.');
    expect(period('2026-12')).toBe('2026-12');
    expect(() => period('2026-12-01')).toThrow('Période invalide (AAAA-MM attendu).');
  });

  it('accepts zero or positive amounts rounded to the millime', () => {
    expect(amount(120.0004, 'Le coût')).toBe(120);
    expect(() => amount(-0.5, 'Le coût')).toThrow('Le coût doit être un nombre positif ou nul.');
    expect(() => amount('120', 'Le coût')).toThrow('Le coût doit être un nombre positif ou nul.');
  });

  it('validates texts and enum values', () => {
    expect(requiredText(' Tapis 3 ', 'Le titre')).toBe('Tapis 3');
    expect(() => requiredText('', 'Le titre')).toThrow('Le titre est obligatoire.');
    expect(optionalText('  ')).toBeNull();
    expect(optionalText(undefined)).toBeUndefined();
    expect(oneOf('URGENT', TicketPriority, 'Priorité')).toBe(TicketPriority.URGENT);
    expect(() => oneOf('urgent', TicketPriority, 'Priorité')).toThrow('Priorité invalide.');
  });
});
