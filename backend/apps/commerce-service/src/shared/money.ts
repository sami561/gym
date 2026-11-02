/**
 * Amounts are computed in millimes (1 TND = 1000 millimes) so that 3-decimal
 * totals stay exact; DTOs expose TND numbers.
 */
export function toMillimes(amount: number): number {
  return Math.round((amount + Math.sign(amount) * Number.EPSILON) * 1000);
}

export function fromMillimes(millimes: number): number {
  return millimes / 1000;
}

export function round3(amount: number): number {
  return fromMillimes(toMillimes(amount));
}
