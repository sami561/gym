import { createHmac } from 'crypto';
import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DeliveryStatus, WebhookDelivery } from './webhook-delivery.entity';
import { WebhooksService } from './webhooks.service';

describe('WebhooksService', () => {
  const savedEnv = process.env;
  const realFetch = global.fetch;
  const fetchMock = jest.fn();
  const secret = 'a'.repeat(64);
  const authToken = 'b'.repeat(64);

  const repository = {
    create: (fields: Partial<WebhookDelivery>) => ({ ...fields }) as WebhookDelivery,
    save: jest.fn(async (row: WebhookDelivery) => {
      row.id ??= '6f1c2a7e-0000-4000-8000-000000000001';
      row.createdAt ??= new Date('2026-11-02T10:00:00.000Z');
      return row;
    }),
  };
  const newService = () => new WebhooksService(repository as unknown as Repository<WebhookDelivery>);
  const sentHeaders = (call = 0) => (fetchMock.mock.calls[call][1] as RequestInit).headers as Record<string, string>;

  let warn: jest.SpyInstance;

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    global.fetch = fetchMock as unknown as typeof fetch;
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    process.env = { ...savedEnv, N8N_WEBHOOK_URL: 'http://n8n:5678/webhook/meliora-events' };
  });

  afterEach(() => {
    process.env = savedEnv;
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('signs the timestamp and the body, and sends WEBHOOK_AUTH_TOKEN as bearer token', async () => {
    Object.assign(process.env, { NODE_ENV: 'production', WEBHOOK_SECRET: secret, WEBHOOK_AUTH_TOKEN: authToken });
    const delivery = await newService().enqueue('payment.received', { memberId: 'm1', amount: 120 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = sentHeaders();
    expect(url).toBe('http://n8n:5678/webhook/meliora-events');
    expect(headers.Authorization).toBe(`Bearer ${authToken}`);
    const signed = `${headers['X-Meliora-Timestamp']}.${init.body as string}`;
    expect(headers['X-Meliora-Signature']).toBe(`sha256=${createHmac('sha256', secret).update(signed).digest('hex')}`);
    expect(delivery.status).toBe(DeliveryStatus.DELIVERED);
  });

  it('fails the delivery without sending it in production when WEBHOOK_SECRET is missing', async () => {
    Object.assign(process.env, { NODE_ENV: 'production', WEBHOOK_AUTH_TOKEN: authToken });
    delete process.env.WEBHOOK_SECRET;
    const delivery = await newService().enqueue('payment.received', { memberId: 'm1' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(delivery).toMatchObject({
      status: DeliveryStatus.FAILED,
      nextAttemptAt: null,
      lastError: 'Envoi refusé en production : WEBHOOK_SECRET non configuré.',
    });
  });

  it('falls back to WEBHOOK_SECRET as bearer token outside production, warning once', async () => {
    Object.assign(process.env, { NODE_ENV: 'development', WEBHOOK_SECRET: secret });
    delete process.env.WEBHOOK_AUTH_TOKEN;
    const service = newService();
    await service.enqueue('member.created', { memberId: 'm1' });
    await service.enqueue('member.created', { memberId: 'm2' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentHeaders(1).Authorization).toBe(`Bearer ${secret}`);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('WEBHOOK_AUTH_TOKEN is empty'));
  });
});
