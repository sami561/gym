import { BadRequestException } from '@nestjs/common';
import { parseDateOnly } from '@app/common';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function requireText(value: unknown, message: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new BadRequestException(message);
  return text;
}

export function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function assertDateOnly(value: unknown, label: string): string {
  if (typeof value !== 'string' || !DATE_ONLY.test(value) || Number.isNaN(parseDateOnly(value).getTime())) {
    throw new BadRequestException(`${label} doit être une date au format AAAA-MM-JJ.`);
  }
  return value;
}

export function parseInstant(value: unknown, label: string): Date {
  const date = typeof value === 'string' || value instanceof Date ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label} : date invalide.`);
  return date;
}

/** null/undefined stay null; otherwise a number within [min, max] rounded to 2 decimals. */
export function optionalMetric(value: unknown, label: string, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new BadRequestException(`${label} doit être compris entre ${min} et ${max}.`);
  }
  return Math.round(number * 100) / 100;
}

export function requireInt(value: unknown, label: string, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new BadRequestException(`${label} doit être un entier entre ${min} et ${max}.`);
  }
  return number;
}

export function requireAmount(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new BadRequestException(`${label} doit être un montant positif.`);
  return Math.round(number * 1000) / 1000;
}

export function likePattern(search: string): string {
  return `%${search.trim().replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}
