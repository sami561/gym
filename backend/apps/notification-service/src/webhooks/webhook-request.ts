import { createHmac } from 'crypto';

export const MAX_ATTEMPTS = 6;
export const WEBHOOK_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 60 * 60_000;

export interface WebhookEnvelope {
  id: string;
  event: string;
  occurredAt: string;
  data: unknown;
}

/** `sha256=<hex HMAC-SHA256(raw body, secret)>`, verified by n8n before trusting the payload. */
export function signWebhookBody(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

/** Exact body and headers of one delivery attempt (the signature covers this exact string). */
export function buildWebhookRequest(
  envelope: WebhookEnvelope,
  secret: string,
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
  };
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
    headers['X-Meliora-Signature'] = signWebhookBody(body, secret);
  }
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
