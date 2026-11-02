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
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  if (!/^https?:\/\//.test(url)) throw new Error('HTTP_RELAY door needs config.url (http:// or https://)');

  const method = typeof raw.method === 'string' ? raw.method.toUpperCase() : 'GET';
  if (!['GET', 'POST', 'PUT'].includes(method)) throw new Error(`Unsupported HTTP method ${method}`);

  const headers: Record<string, string> = {};
  if (raw.headers && typeof raw.headers === 'object') {
    for (const [key, value] of Object.entries(raw.headers as Record<string, unknown>)) {
      if (value !== undefined && value !== null) headers[key] = String(value);
    }
  }
  const auth = raw.basicAuth as { username?: string; password?: string } | undefined;
  if (auth?.username) {
    headers.Authorization = `Basic ${Buffer.from(`${auth.username}:${auth.password ?? ''}`).toString('base64')}`;
  }

  let body: string | null = null;
  if (typeof raw.body === 'string') body = raw.body;
  else if (raw.body && typeof raw.body === 'object') {
    body = JSON.stringify(raw.body);
    headers['Content-Type'] ??= 'application/json';
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
    else this.ctx.logger.info('relay ready', { url: redact(this.relay.url) });
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
    return url;
  }
}
