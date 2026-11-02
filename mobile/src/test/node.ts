import { jest } from '@jest/globals';

/*
 * Node built-ins for tests. The app is type-checked without Node's types (React Native has no `node:*`
 * modules, so they must not look importable from app code): tests load them through Jest instead,
 * typed with just the signatures they use.
 */

interface Hmac {
  update(data: string): Hmac;
  digest(encoding: 'hex'): string;
}

export const { createHmac } = jest.requireActual<{ createHmac(algorithm: 'sha256', key: string): Hmac }>('node:crypto');

export const { readFileSync, readdirSync } = jest.requireActual<{
  readFileSync(path: string, encoding: 'utf8'): string;
  /** Paths relative to `path`, at every depth. */
  readdirSync(path: string, options: { recursive: true }): string[];
}>('node:fs');
