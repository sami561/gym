import { BadRequestException } from '@nestjs/common';
import { parseOutboundUrl } from '@app/common';

/**
 * HTTP relay doors (Shelly, ESP32, Tasmota...). Same config and request as the door agent
 * (door-agent/src/doors/http-relay.ts), so a relay behaves the same with or without an agent:
 *   { url, method?: GET|POST|PUT, headers?, basicAuth?: { username, password? }, body?, timeoutMs? }
 * Placeholders {seconds}, {ms} and {doorId} are replaced in url, headers and body.
 */

export const RELAY_METHODS = ['GET', 'POST', 'PUT'] as const;
export type RelayMethod = (typeof RELAY_METHODS)[number];

export const RELAY_TIMEOUT_MS = { default: 5_000, min: 500, max: 30_000 } as const;

const MAX_HEADERS = 20;
const MAX_HEADER_VALUE_LENGTH = 4_096;
const MAX_CREDENTIAL_LENGTH = 200;
const MAX_BODY_LENGTH = 10_000;
/** RFC 9110 token. */
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const CONTROL_CHARACTERS = /[\r\n\0]/;

export interface PlaceholderValues {
  seconds: number;
  doorId: string;
}

/** Values a URL with placeholders is checked with when the door is saved. */
const SAMPLE_VALUES: PlaceholderValues = { seconds: 5, doorId: '00000000-0000-4000-8000-000000000000' };

export interface RelayRequest {
  url: string;
  method: RelayMethod;
  headers: Record<string, string>;
  body: string | undefined;
  timeoutMs: number;
}

interface RelayConfig {
  url: string;
  method: RelayMethod;
  headers: Record<string, string>;
  body: { text: string; json: boolean } | null;
  timeoutMs: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function fillPlaceholders(template: string, values: PlaceholderValues): string {
  return template
    .replace(/\{seconds\}/g, String(values.seconds))
    .replace(/\{ms\}/g, String(values.seconds * 1000))
    .replace(/\{doorId\}/g, encodeURIComponent(values.doorId));
}

function readUrl(raw: unknown): string {
  const url = typeof raw === 'string' ? raw.trim() : '';
  if (!url) throw new BadRequestException('URL du relais requise (http:// ou https://).');
  // http(s) only, no user:password, at most 2048 characters: checked as it will be requested.
  parseOutboundUrl(fillPlaceholders(url, SAMPLE_VALUES));
  return url;
}

function readMethod(raw: unknown): RelayMethod {
  if (raw === undefined || raw === null || raw === '') return 'GET';
  const method = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!(RELAY_METHODS as readonly string[]).includes(method)) {
    throw new BadRequestException('Méthode HTTP du relais non prise en charge (GET, POST ou PUT).');
  }
  return method as RelayMethod;
}

function invalidHeaders(): BadRequestException {
  return new BadRequestException(
    `En-têtes HTTP du relais invalides (${MAX_HEADERS} au plus, nom sans espace, valeur texte sur une ligne).`,
  );
}

function invalidCredentials(): BadRequestException {
  return new BadRequestException(
    'Authentification du relais invalide : { username, password } en texte (« : » interdit dans le nom).',
  );
}

function readHeaders(raw: unknown, basicAuth: unknown): Record<string, string> {
  const headers: Record<string, string> = {};
  if (raw !== undefined && raw !== null) {
    if (!isPlainObject(raw)) throw invalidHeaders();
    const entries = Object.entries(raw).filter(([, value]) => value !== undefined && value !== null);
    if (entries.length > MAX_HEADERS) throw invalidHeaders();
    for (const [name, value] of entries) {
      if (!HEADER_NAME.test(name) || !['string', 'number', 'boolean'].includes(typeof value)) throw invalidHeaders();
      const text = String(value);
      if (text.length > MAX_HEADER_VALUE_LENGTH || CONTROL_CHARACTERS.test(text)) throw invalidHeaders();
      headers[name] = text;
    }
  }
  if (basicAuth !== undefined && basicAuth !== null) {
    if (!isPlainObject(basicAuth)) throw invalidCredentials();
    const username = basicAuth.username ?? '';
    const password = basicAuth.password ?? '';
    if (typeof username !== 'string' || typeof password !== 'string') throw invalidCredentials();
    if (
      username.includes(':') ||
      username.length > MAX_CREDENTIAL_LENGTH ||
      password.length > MAX_CREDENTIAL_LENGTH ||
      CONTROL_CHARACTERS.test(username + password)
    ) {
      throw invalidCredentials();
    }
    // Like the agent: no username, no Authorization header.
    if (username) {
      for (const name of Object.keys(headers)) if (name.toLowerCase() === 'authorization') delete headers[name];
      headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    }
  }
  return headers;
}

function readBody(raw: unknown): { text: string; json: boolean } | null {
  if (raw === undefined || raw === null) return null;
  const body =
    typeof raw === 'string' ? { text: raw, json: false } : typeof raw === 'object' ? { text: JSON.stringify(raw), json: true } : null;
  if (!body || body.text.length > MAX_BODY_LENGTH) {
    throw new BadRequestException(`Corps de requête du relais invalide (texte ou JSON, ${MAX_BODY_LENGTH} caractères au plus).`);
  }
  return body;
}

function readTimeout(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return RELAY_TIMEOUT_MS.default;
  const timeoutMs = Number(raw);
  if (!Number.isFinite(timeoutMs) || timeoutMs < RELAY_TIMEOUT_MS.min || timeoutMs > RELAY_TIMEOUT_MS.max) {
    throw new BadRequestException(`Délai du relais invalide (${RELAY_TIMEOUT_MS.min} à ${RELAY_TIMEOUT_MS.max} ms).`);
  }
  return timeoutMs;
}

function readRelayConfig(config: Record<string, unknown>): RelayConfig {
  return {
    url: readUrl(config.url),
    method: readMethod(config.method),
    headers: readHeaders(config.headers, config.basicAuth),
    body: readBody(config.body),
    timeoutMs: readTimeout(config.timeoutMs),
  };
}

/**
 * Checks the config of an HTTP_RELAY door being saved (BadRequestException with a French message)
 * and returns it with the URL trimmed and the method upper-cased.
 */
export function validateRelayConfig(config: Record<string, unknown>): Record<string, unknown> {
  const { url, method } = readRelayConfig(config);
  return { ...config, url, method };
}

/** The request the server sends to open a relay door that has no agent. */
export function buildRelayRequest(config: Record<string, unknown>, values: PlaceholderValues): RelayRequest {
  const relay = readRelayConfig(config);
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(relay.headers)) headers[name] = fillPlaceholders(value, values);
  if (relay.body?.json && !Object.keys(headers).some((name) => name.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }
  return {
    url: fillPlaceholders(relay.url, values),
    method: relay.method,
    headers,
    // fetch refuses a body on GET; the agent drops it too.
    body: relay.method === 'GET' || !relay.body ? undefined : fillPlaceholders(relay.body.text, values),
    timeoutMs: relay.timeoutMs,
  };
}
