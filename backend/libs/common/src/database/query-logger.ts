import { AdvancedConsoleLogger } from 'typeorm';

/**
 * TypeORM's console logger, without the values that must never reach the logs. A failed query (always
 * logged) and every query with DB_LOGGING are printed with their parameters: password hashes, QR secrets,
 * agent keys, names, e-mails, GPS positions and member photos would all be printed as they are.
 * Kept as they are: ids (UUIDs), dates, numbers, booleans and null — enough to find the row. Text becomes
 * `<text N>`, objects (json columns) `<object>`, bytea `<binary N bytes>`.
 */
export class RedactingQueryLogger extends AdvancedConsoleLogger {
  protected stringifyParams(parameters: unknown[]): string | unknown[] {
    return super.stringifyParams(parameters.map(redactParam));
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_OR_INSTANT = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?$/;

export function redactParam(value: unknown): unknown {
  if (value instanceof Uint8Array) return `<binary ${value.length} bytes>`;
  if (typeof value === 'string') return UUID.test(value) || DATE_OR_INSTANT.test(value) ? value : `<text ${value.length}>`;
  if (Array.isArray(value)) return value.map(redactParam);
  if (value instanceof Date || value === null || typeof value !== 'object') return value;
  return '<object>';
}
