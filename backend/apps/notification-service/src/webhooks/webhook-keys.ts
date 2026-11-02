/**
 * Keys of the webhooks sent to n8n (security review, finding 10). WEBHOOK_SECRET signs every
 * request and never leaves the backend; WEBHOOK_AUTH_TOKEN is the bearer token checked by the n8n
 * Webhook node, which saves the request headers with each execution. The two values must differ
 * (assertSecureConfig refuses equal values in production).
 */

export interface WebhookKeys {
  /** HMAC-SHA256 key of X-Meliora-Signature; '' sends the request unsigned (outside production only). */
  secret: string;
  /** Sent as `Authorization: Bearer <authToken>`; '' sends no Authorization header. */
  authToken: string;
}

export interface WebhookKeysConfig {
  keys: WebhookKeys;
  /** Why no delivery may be sent (production without its keys), stored as the delivery's lastError. */
  refusal: string | null;
  /** Development fallbacks, to log once. */
  warnings: string[];
}

/**
 * Production needs both keys and never sends an unsigned or unauthenticated webhook. Outside
 * production an empty WEBHOOK_AUTH_TOKEN falls back to WEBHOOK_SECRET and an empty WEBHOOK_SECRET
 * sends unsigned requests, each with a warning.
 */
export function webhookKeys(source: Record<string, string | undefined>): WebhookKeysConfig {
  const secret = source.WEBHOOK_SECRET ?? '';
  const authToken = source.WEBHOOK_AUTH_TOKEN ?? '';

  if (source.NODE_ENV === 'production') {
    const missing = [secret ? null : 'WEBHOOK_SECRET', authToken ? null : 'WEBHOOK_AUTH_TOKEN'].filter(
      (name): name is string => name !== null,
    );
    const refusal = missing.length
      ? `Envoi refusé en production : ${missing.join(' et ')} ${missing.length > 1 ? 'non configurés' : 'non configuré'}.`
      : null;
    return { keys: { secret, authToken }, refusal, warnings: [] };
  }

  const warnings: string[] = [];
  if (!secret) warnings.push('WEBHOOK_SECRET is empty: webhooks are sent unsigned (refused with NODE_ENV=production)');
  else if (!authToken) {
    warnings.push(
      'WEBHOOK_AUTH_TOKEN is empty: WEBHOOK_SECRET is sent as the bearer token (development only, set another random value)',
    );
  }
  return { keys: { secret, authToken: authToken || secret }, refusal: null, warnings };
}
