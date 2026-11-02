import * as dotenv from 'dotenv';
import * as path from 'path';
import { assertSecureConfig } from './secure-config';

let loaded = false;

/**
 * Loads backend/.env once (no-op in containers where env comes from the orchestrator),
 * then refuses example or weak secrets when NODE_ENV=production (assertSecureConfig).
 */
export function loadEnv(): void {
  if (loaded) return;
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  process.env.TZ = process.env.TZ || 'Africa/Tunis';
  // Marked loaded only once the check passes: every later env() call throws as well.
  assertSecureConfig(process.env);
  loaded = true;
}

export function env(name: string, fallback?: string): string {
  loadEnv();
  const value = process.env[name];
  if (value !== undefined && value !== '') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable ${name}`);
}

export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseFloat(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

/** Comma-separated env var as trimmed, non-empty entries ([] when unset). */
export function csvEnv(name: string): string[] {
  loadEnv();
  return (process.env[name] ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}
