import { withTimeout } from '../command-queue';
import { errorMessage } from '../logger';
import type { AgentDoorConfig } from '../types/contracts';
import type { DoorDriver, DriverContext, DriverStatus } from './driver';

export interface HttpRelayConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT';
  headers: Record<string, string>;
  body: string | null;
  timeoutMs: number;
}

/**
 * Generic HTTP relay (Shelly, ESP32, Sonoff/Tasmota, any controller with an HTTP API).
 * Placeholders {seconds}, {ms} and {doorId} are replaced in url, headers and body.
 *   Shelly Gen2: GET http://192.168.1.50/rpc/Switch.Set?id=0&on=true&toggle_after={seconds}
 *   ESP32:       POST http://192.168.1.60/open  body {"seconds": {seconds}}
 */
export function parseHttpRelayConfig(raw: Record<string, unknown>): HttpRelayConfig {
  const configured = typeof raw.url === 'string' ? raw.url.trim() : '';
  if (!/^https?:\/\//.test(configured)) throw new Error('HTTP_RELAY door needs config.url (http:// or https://)');
  // fetch() refuses a URL with user:password@ (and its error repeats the password): Basic auth instead.
  const { url, username, password } = splitCredentials(configured);

  const method = typeof raw.method === 'string' ? raw.method.toUpperCase() : 'GET';
  if (!['GET', 'POST', 'PUT'].includes(method)) throw new Error(`Unsupported HTTP method ${method}`);

  const headers: Record<string, string> = {};
  if (raw.headers && typeof raw.headers === 'object') {
    for (const [key, value] of Object.entries(raw.headers as Record<string, unknown>)) {
      if (value !== undefined && value !== null) headers[key] = String(value);
    }
  }
  const auth = raw.basicAuth as { username?: string; password?: string } | undefined;
  if (auth?.username) setHeader(headers, 'Authorization', basicAuth(auth.username, auth.password ?? ''));
  else if (username && !hasHeader(headers, 'Authorization')) setHeader(headers, 'Authorization', basicAuth(username, password));

  let body: string | null = null;
  if (typeof raw.body === 'string') body = raw.body;
  else if (raw.body && typeof raw.body === 'object') {
    body = JSON.stringify(raw.body);
    if (!hasHeader(headers, 'Content-Type')) headers['Content-Type'] = 'application/json';
  }

  const timeoutMs = Number(raw.timeoutMs ?? 5000);
  return {
    url,
    method: method as HttpRelayConfig['method'],
    headers,
    body,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000,
  };
}

/** Takes user:password@ out of an http(s) URL (the userinfo ends at the last @ of the authority). */
function splitCredentials(url: string): { url: string; username: string; password: string } {
  const match = /^(https?:\/\/)([^/?#\\]*)@/i.exec(url);
  if (!match) return { url, username: '', password: '' };
  const userinfo = match[2];
  const colon = userinfo.indexOf(':');
  return {
    url: match[1] + url.slice(match[0].length),
    username: percentDecode(colon === -1 ? userinfo : userinfo.slice(0, colon)),
    password: percentDecode(colon === -1 ? '' : userinfo.slice(colon + 1)),
  };
}

function percentDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

/** Header names are case-insensitive: fetch() would send both spellings, values joined. */
function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());
}

function setHeader(headers: Record<string, string>, name: string, value: string): void {
  for (const key of Object.keys(headers)) if (key.toLowerCase() === name.toLowerCase()) delete headers[key];
  headers[name] = value;
}

export function fillPlaceholders(template: string, values: { seconds: number; doorId: string }): string {
  return template
    .replace(/\{seconds\}/g, String(values.seconds))
    .replace(/\{ms\}/g, String(values.seconds * 1000))
    .replace(/\{doorId\}/g, encodeURIComponent(values.doorId));
}

export class HttpRelayDriver implements DoorDriver {
  readonly kind = 'HTTP_RELAY' as const;
  private readonly relay: HttpRelayConfig | null;
  private lastError: string | null = null;

  constructor(
    private readonly door: AgentDoorConfig,
    private readonly ctx: DriverContext,
  ) {
    try {
      this.relay = parseHttpRelayConfig(door.config);
    } catch (err) {
      this.relay = null;
      this.lastError = errorMessage(err);
    }
  }

  async start(): Promise<void> {
    if (!this.relay) this.ctx.logger.error('invalid relay configuration', { error: this.lastError });
    // The configured URL: user:***@ shows the credentials it carries (sent as Basic auth).
    else this.ctx.logger.info('relay ready', { url: redact(String(this.door.config.url).trim()) });
  }

  async stop(): Promise<void> {}

  async open(seconds: number): Promise<void> {
    if (!this.relay) throw new Error(this.lastError ?? 'Relay not configured');
    const values = { seconds, doorId: this.door.id };
    const url = fillPlaceholders(this.relay.url, values);
    const headers = Object.fromEntries(
      Object.entries(this.relay.headers).map(([key, value]) => [key, fillPlaceholders(value, values)]),
    );
    const controller = new AbortController();
    try {
      const response = await withTimeout(
        fetch(url, {
          method: this.relay.method,
          headers,
          body: this.relay.method === 'GET' || this.relay.body === null ? undefined : fillPlaceholders(this.relay.body, values),
          signal: controller.signal,
        }),
        this.relay.timeoutMs,
        'relay request',
      );
      if (!response.ok) {
        const text = (await response.text().catch(() => '')).slice(0, 200);
        throw new Error(`Relay answered HTTP ${response.status}${text ? `: ${text}` : ''}`);
      }
      this.lastError = null;
      this.ctx.logger.info('relay triggered', { seconds, status: response.status });
    } catch (err) {
      controller.abort();
      this.lastError = errorMessage(err);
      throw err;
    }
  }

  status(): DriverStatus {
    return this.lastError ? { status: 'error', error: this.lastError } : { status: 'ok' };
  }
}

function redact(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    // not a valid URL (e.g. port 99999): mask the password by hand
    return url.replace(/^(https?:\/\/[^/?#\\:@]*:)[^/?#\\]*@/i, '$1***@');
  }
}
