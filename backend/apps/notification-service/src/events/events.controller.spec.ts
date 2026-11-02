import { PATTERN_METADATA } from '@nestjs/microservices/constants';
import { BaseRpcContext } from '@nestjs/microservices';
import { EVENTS, WEBHOOK_EVENTS } from '@app/common';
import { EventsController } from './events.controller';
import { WebhooksService } from '../webhooks/webhooks.service';
import { PushService } from '../push/push.service';

describe('EventsController', () => {
  const webhooks = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const push = { sendToUser: jest.fn().mockResolvedValue(1), removeUser: jest.fn().mockResolvedValue(undefined) };
  const controller = new EventsController(webhooks as unknown as WebhooksService, push as unknown as PushService);
  const context = (event: string) => new BaseRpcContext([event]);

  beforeEach(() => jest.clearAllMocks());

  it('subscribes to every entry of WEBHOOK_EVENTS', () => {
    const patterns = Reflect.getMetadata(PATTERN_METADATA, EventsController.prototype.onWebhookEvent);
    expect(patterns).toEqual(WEBHOOK_EVENTS);
    expect(WEBHOOK_EVENTS).toEqual(
      expect.arrayContaining(['lead.created', 'sale.completed', 'stock.low', 'maintenance.opened']),
    );
  });

  it('forwards the event named by the transport context to n8n', async () => {
    const data = { leadId: 'l1', firstName: 'Sana' };
    await controller.onWebhookEvent(data, context(EVENTS.leadCreated));
    expect(webhooks.enqueue).toHaveBeenCalledWith('lead.created', data);
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('also pushes to the member for payment / expiry events', async () => {
    const data = { paymentId: 'p1', memberId: 'm1', firstName: 'A', amount: 50, planName: null };
    await controller.onWebhookEvent(data, context(EVENTS.paymentReceived));
    expect(webhooks.enqueue).toHaveBeenCalledWith('payment.received', data);
    expect(push.sendToUser).toHaveBeenCalledWith('m1', expect.objectContaining({ title: 'Paiement reçu' }));
  });

  it('keeps forwarding when the push fails', async () => {
    push.sendToUser.mockRejectedValueOnce(new Error('expo down'));
    await expect(
      controller.onWebhookEvent(
        { subscriptionId: 's', memberId: 'm1', planName: 'Mensuel', endDate: '2026-11-03' },
        context(EVENTS.subscriptionExpired),
      ),
    ).resolves.toBeUndefined();
    expect(webhooks.enqueue).toHaveBeenCalledTimes(1);
  });

  it('forgets device tokens of deleted members', async () => {
    await controller.onMemberDeleted({ memberId: 'm9' });
    expect(push.removeUser).toHaveBeenCalledWith('m9');
  });
});
