import { createHmac } from 'crypto';
import { MAX_ATTEMPTS, backoffMs, buildWebhookRequest, describeError, signWebhookBody } from './webhook-request';

describe('webhook request', () => {
  const envelope = {
    id: '6f1c2a7e-0000-4000-8000-000000000001',
    event: 'payment.received',
    occurredAt: '2026-11-02T10:00:00.000Z',
    data: { memberId: 'm1', amount: 120.5, firstName: 'Amine' },
  };

  it('signs the exact body with HMAC-SHA256 and sends the documented headers', () => {
    const { body, headers } = buildWebhookRequest(envelope, 'top-secret');
    expect(JSON.parse(body)).toEqual(envelope);
    const expected = createHmac('sha256', 'top-secret').update(body).digest('hex');
    expect(headers['X-Meliora-Signature']).toBe(`sha256=${expected}`);
    expect(headers.Authorization).toBe('Bearer top-secret');
    expect(headers['X-Meliora-Event']).toBe('payment.received');
    expect(headers['X-Meliora-Delivery']).toBe(envelope.id);
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('keeps the body field order id, event, occurredAt, data', () => {
    const { body } = buildWebhookRequest({ ...envelope }, 's');
    expect(Object.keys(JSON.parse(body))).toEqual(['id', 'event', 'occurredAt', 'data']);
  });

  it('sends unsigned requests when no secret is configured', () => {
    const { headers } = buildWebhookRequest(envelope, '');
    expect(headers.Authorization).toBeUndefined();
    expect(headers['X-Meliora-Signature']).toBeUndefined();
  });

  it('changes the signature when the body is tampered with', () => {
    const { body } = buildWebhookRequest(envelope, 'k');
    expect(signWebhookBody(body.replace('120.5', '1.5'), 'k')).not.toBe(signWebhookBody(body, 'k'));
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
