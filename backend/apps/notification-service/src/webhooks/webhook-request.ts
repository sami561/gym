import { createHmac } from 'crypto';
import { WebhookKeys } from './webhook-keys';

export const MAX_ATTEMPTS = 6;
export const WEBHOOK_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 60 * 60_000;

export interface WebhookEnvelope {
  id: string;
  event: string;
  occurredAt: string;
  data: unknown;
}

/**
 * `sha256=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>`, verified by n8n before trusting
 * the payload; n8n also refuses a timestamp more than 5 minutes away from its clock (replays).
 */
export function signWebhook(timestamp: number, body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex')}`;
}

/**
 * Exact body and headers of one delivery attempt. Each attempt gets its own timestamp (unix
 * seconds), so retries stay within n8n's window; the signature covers it and this exact body.
 */
export function buildWebhookRequest(
  envelope: WebhookEnvelope,
  keys: WebhookKeys,
  timestamp = Math.floor(Date.now() / 1000),
): { body: string; headers: Record<string, string> } {
  const body = JSON.stringify({
    id: envelope.id,
    event: envelope.event,
    occurredAt: envelope.occurredAt,
    data: envelope.data,
  });
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'meliora-notification-service/1.0',
    'X-Meliora-Event': envelope.event,
    'X-Meliora-Delivery': envelope.id,
    'X-Meliora-Timestamp': String(timestamp),
  };
  if (keys.authToken) headers.Authorization = `Bearer ${keys.authToken}`;
  if (keys.secret) headers['X-Meliora-Signature'] = signWebhook(timestamp, body, keys.secret);
  return { body, headers };
}

/** Delay before the next attempt after `attempts` failures: 1, 2, 4, 8, 16 min (capped at 1 h). */
export function backoffMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, 60_000 * 2 ** Math.max(0, attempts - 1));
}

export function describeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return `Délai dépassé (${WEBHOOK_TIMEOUT_MS / 1000} s)`;
    }
    const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
    const detail = cause?.code ?? cause?.message;
    return detail ? `${err.message} (${detail})` : err.message;
  }
  return String(err);
}
