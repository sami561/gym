import { createHmac } from 'crypto';
import { MAX_ATTEMPTS, backoffMs, buildWebhookRequest, describeError, signWebhook } from './webhook-request';

describe('webhook request', () => {
  const envelope = {
    id: '6f1c2a7e-0000-4000-8000-000000000001',
    event: 'payment.received',
    occurredAt: '2026-11-02T10:00:00.000Z',
    data: { memberId: 'm1', amount: 120.5, firstName: 'Amine' },
  };
  const keys = { secret: 'signing-key', authToken: 'bearer-token' };
  const timestamp = 1_793_613_600;

  it('signs "<timestamp>.<body>" with HMAC-SHA256 and sends the documented headers', () => {
    const { body, headers } = buildWebhookRequest(envelope, keys, timestamp);
    expect(JSON.parse(body)).toEqual(envelope);
    const expected = createHmac('sha256', 'signing-key').update(`${timestamp}.${body}`).digest('hex');
    expect(headers['X-Meliora-Signature']).toBe(`sha256=${expected}`);
    expect(headers['X-Meliora-Timestamp']).toBe('1793613600');
    expect(headers.Authorization).toBe('Bearer bearer-token');
    expect(headers['X-Meliora-Event']).toBe('payment.received');
    expect(headers['X-Meliora-Delivery']).toBe(envelope.id);
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('never sends the signing key', () => {
    const { headers } = buildWebhookRequest(envelope, keys, timestamp);
    expect(Object.values(headers).some((value) => value.includes('signing-key'))).toBe(false);
  });

  it('stamps each attempt with the current unix time by default', () => {
    const before = Math.floor(Date.now() / 1000);
    const { headers } = buildWebhookRequest(envelope, keys);
    const stamped = Number(headers['X-Meliora-Timestamp']);
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  });

  it('keeps the body field order id, event, occurredAt, data', () => {
    const { body } = buildWebhookRequest({ ...envelope }, keys, timestamp);
    expect(Object.keys(JSON.parse(body))).toEqual(['id', 'event', 'occurredAt', 'data']);
  });

  it('sends unsigned requests without Authorization when no key is configured', () => {
    const { headers } = buildWebhookRequest(envelope, { secret: '', authToken: '' }, timestamp);
    expect(headers.Authorization).toBeUndefined();
    expect(headers['X-Meliora-Signature']).toBeUndefined();
    expect(headers['X-Meliora-Timestamp']).toBe('1793613600');
  });

  it('changes the signature when the body, the timestamp or the key changes', () => {
    const { body } = buildWebhookRequest(envelope, keys, timestamp);
    const signature = signWebhook(timestamp, body, 'k');
    expect(signWebhook(timestamp, body.replace('120.5', '1.5'), 'k')).not.toBe(signature);
    expect(signWebhook(timestamp + 1, body, 'k')).not.toBe(signature);
    expect(signWebhook(timestamp, body, 'other')).not.toBe(signature);
  });

  it('backs off 1, 2, 4, 8, 16 minutes between the 6 attempts', () => {
    const minutes = Array.from({ length: MAX_ATTEMPTS - 1 }, (_, i) => backoffMs(i + 1) / 60_000);
    expect(MAX_ATTEMPTS).toBe(6);
    expect(minutes).toEqual([1, 2, 4, 8, 16]);
    expect(backoffMs(20)).toBe(60 * 60_000);
  });

  it('describes timeouts and network errors in a readable way', () => {
    const timeout = new Error('aborted');
    timeout.name = 'TimeoutError';
    expect(describeError(timeout)).toBe('Délai dépassé (10 s)');
    const refused = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    expect(describeError(refused)).toBe('fetch failed (ECONNREFUSED)');
  });
});
