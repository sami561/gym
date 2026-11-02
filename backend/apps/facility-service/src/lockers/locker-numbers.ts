import { BadRequestException } from '@nestjs/common';

export const MAX_LOCKERS_PER_BATCH = 500;

/** Locker numbers prefix + n for n in [from, to], e.g. "H-" 1..3 → H-1, H-2, H-3. */
export function lockerNumbers(prefix: string | undefined, from: number, to: number): string[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
    throw new BadRequestException('Plage de numéros invalide (de 1 à N, début ≤ fin).');
  }
  if (to - from + 1 > MAX_LOCKERS_PER_BATCH) {
    throw new BadRequestException(`${MAX_LOCKERS_PER_BATCH} casiers maximum par création.`);
  }
  const clean = (prefix ?? '').trim();
  if (clean.length > 10) throw new BadRequestException('Préfixe trop long (10 caractères maximum).');
  return Array.from({ length: to - from + 1 }, (_, index) => `${clean}${from + index}`);
}

/** Natural order: H-2 before H-10. */
export function compareLockerNumbers(a: string, b: string): number {
  return a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });
}
