import { BadRequestException } from '@nestjs/common';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Validates a calendar date (YYYY-MM-DD) and returns it unchanged. */
export function dateOnly(value: unknown, field: string): string {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) {
    throw new BadRequestException(`${field} : date invalide (AAAA-MM-JJ attendu).`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${field} : date invalide (AAAA-MM-JJ attendu).`);
  }
  return value;
}

/** undefined stays undefined (field not sent), '' / null become null. */
export function optionalDateOnly(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return dateOnly(value, field);
}

export function dateTime(value: unknown, field: string): Date {
  const parsed = typeof value === 'string' || value instanceof Date ? new Date(value) : new Date(NaN);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`${field} : date/heure invalide.`);
  return parsed;
}

export function period(value: unknown): string {
  if (typeof value !== 'string' || !PERIOD.test(value)) {
    throw new BadRequestException('Période invalide (AAAA-MM attendu).');
  }
  return value;
}

export function amount(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new BadRequestException(`${field} doit être un nombre positif ou nul.`);
  }
  return round3(value);
}

export function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`${field} est obligatoire.`);
  return value.trim();
}

/** undefined stays undefined, empty strings become null. */
export function optionalText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

export function oneOf<T extends string>(value: unknown, allowed: Record<string, T>, field: string): T {
  if (!Object.values(allowed).includes(value as T)) {
    throw new BadRequestException(`${field} invalide.`);
  }
  return value as T;
}
