import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { EVENTS, EventBus, MemberStatus, PaymentMethod, Role, SubscriptionStatus } from '@app/common';
import { Member } from '../members/member.entity';
import { PaymentsService } from '../payments/payments.service';
import { Plan } from '../plans/plan.entity';
import { PromosService } from '../promos/promos.service';
import { Subscription } from './subscription.entity';
import { SubscriptionsService } from './subscriptions.service';

const TODAY = '2026-11-02';
const actor = { id: 'u-staff', role: Role.STAFF, name: 'Sami' };

const member = Object.assign(new Member(), {
  id: 'm-1',
  memberCode: 'MEL-00042',
  firstName: 'Amira',
  lastName: 'Ben Salah',
  email: 'amira@example.com',
  phone: null,
  status: MemberStatus.ACTIVE,
});
const monthly = Object.assign(new Plan(), { id: 'plan-1', name: 'Mensuel', durationDays: 30, price: 90, isActive: true });

function sub(overrides: Partial<Subscription>): Subscription {
  return Object.assign(new Subscription(), {
    id: 's-1',
    memberId: 'm-1',
    planId: 'plan-1',
    plan: monthly,
    status: SubscriptionStatus.ACTIVE,
    price: 90,
    promoCode: null,
    discount: 0,
    frozenAt: null,
    frozenDays: null,
    freezeReason: null,
    reminderSentAt: null,
    createdAt: new Date('2026-10-01T09:00:00.000Z'),
    ...overrides,
  });
}

/**
 * `active` is what the repository returns for the member's ACTIVE subscriptions (renewal start and
 * entitlement); `stored` is the subscription found by id.
 */
function setup({ active = [] as Subscription[], stored = null as Subscription | null } = {}) {
  const subs = {
    find: jest.fn().mockResolvedValue(active),
    findOne: jest.fn().mockResolvedValue(stored),
    create: jest.fn((data: Partial<Subscription>) => Object.assign(new Subscription(), data)),
    save: jest.fn(async (row: Subscription) => Object.assign(row, { id: row.id ?? 's-new', createdAt: row.createdAt ?? new Date() })),
  };
  const members = { findOne: jest.fn().mockResolvedValue(member) };
  const plans = { findOne: jest.fn().mockResolvedValue(monthly) };
  const payments = { create: jest.fn().mockResolvedValue({}) };
  const promos = { redeem: jest.fn() };
  const events = { publish: jest.fn() };
  const service = new SubscriptionsService(
    subs as unknown as Repository<Subscription>,
    members as unknown as Repository<Member>,
    plans as unknown as Repository<Plan>,
    payments as unknown as PaymentsService,
    promos as unknown as PromosService,
    events as unknown as EventBus,
  );
  const saved = () => subs.save.mock.calls[subs.save.mock.calls.length - 1][0];
  return { service, subs, members, plans, payments, promos, events, saved };
}

describe('SubscriptionsService (gym days in Africa/Tunis)', () => {
  beforeEach(() => jest.useFakeTimers({ now: new Date(2026, 10, 2, 10, 0) }));
  afterEach(() => jest.useRealTimers());

  describe('create', () => {
    it('refuses an unknown member, an unknown plan and a plan no longer sold', async () => {
      const unknownMember = setup();
      unknownMember.members.findOne.mockResolvedValue(null);
      await expect(unknownMember.service.create({ memberId: 'm-x', planId: 'plan-1' })).rejects.toThrow(
        new NotFoundException('Membre introuvable.'),
      );
      const unknownPlan = setup();
      unknownPlan.plans.findOne.mockResolvedValue(null);
      await expect(unknownPlan.service.create({ memberId: 'm-1', planId: 'plan-x' })).rejects.toThrow('Offre introuvable.');
      const retired = setup();
      retired.plans.findOne.mockResolvedValue(Object.assign(new Plan(), monthly, { isActive: false }));
      await expect(retired.service.create({ memberId: 'm-1', planId: 'plan-1' })).rejects.toThrow(
        new BadRequestException('Cette offre n’est plus proposée.'),
      );
    });

    it('refuses a start date that is not YYYY-MM-DD', async () => {
      await expect(setup().service.create({ memberId: 'm-1', planId: 'plan-1', startDate: '02/11/2026' })).rejects.toThrow(
        'Date de début invalide (AAAA-MM-JJ).',
      );
    });

    it('starts today without current access, the plan duration counting today', async () => {
      const { service } = setup();
      expect(await service.create({ memberId: 'm-1', planId: 'plan-1' })).toMatchObject({
        startDate: TODAY,
        endDate: '2026-12-01',
        status: SubscriptionStatus.ACTIVE,
        price: 90,
      });
    });

    it('starts a renewal the day after the current access, chained renewals included', async () => {
      const current = sub({ startDate: '2026-10-10', endDate: '2026-11-08' });
      expect(await setup({ active: [current] }).service.create({ memberId: 'm-1', planId: 'plan-1' })).toMatchObject({
        startDate: '2026-11-09',
        endDate: '2026-12-08',
      });
      const paidAhead = sub({ id: 's-2', startDate: '2026-11-09', endDate: '2026-12-08' });
      expect(
        await setup({ active: [paidAhead, current] }).service.create({ memberId: 'm-1', planId: 'plan-1' }),
      ).toMatchObject({ startDate: '2026-12-09', endDate: '2027-01-07' });
    });

    it('starts today when the last subscription ended, even if not marked expired yet', async () => {
      const ended = sub({ startDate: '2026-10-02', endDate: '2026-10-31' });
      expect(await setup({ active: [ended] }).service.create({ memberId: 'm-1', planId: 'plan-1' })).toMatchObject({
        startDate: TODAY,
      });
    });

    it('keeps an explicit start date', async () => {
      expect(
        await setup().service.create({ memberId: 'm-1', planId: 'plan-1', startDate: '2027-01-01' }),
      ).toMatchObject({ startDate: '2027-01-01', endDate: '2027-01-30' });
    });

    it('applies a promo code and records it with the discount', async () => {
      const { service, promos, saved } = setup();
      promos.redeem.mockResolvedValue({ code: 'ETE26', planPrice: 90, discount: 13.5, price: 76.5 });
      const dto = await service.create({ memberId: 'm-1', planId: 'plan-1', promoCode: 'ete26' });
      expect(promos.redeem).toHaveBeenCalledWith('ete26', monthly);
      expect(dto.price).toBe(76.5);
      expect(saved()).toMatchObject({ promoCode: 'ETE26', discount: 13.5, price: 76.5 });
    });

    it('lets staff set the price, rounded to the millime', async () => {
      expect((await setup().service.create({ memberId: 'm-1', planId: 'plan-1', price: 0 })).price).toBe(0);
      expect((await setup().service.create({ memberId: 'm-1', planId: 'plan-1', price: 33.33349 })).price).toBe(33.333);
    });

    it('records the payment (subscription price by default) and announces the subscription', async () => {
      const { service, payments, events } = setup();
      await service.create({ memberId: 'm-1', planId: 'plan-1', payment: { method: PaymentMethod.CASH }, actor });
      expect(payments.create).toHaveBeenCalledWith({
        memberId: 'm-1',
        amount: 90,
        method: PaymentMethod.CASH,
        reference: undefined,
        subscriptionId: 's-new',
        actor,
      });
      expect(events.publish).toHaveBeenCalledWith(EVENTS.subscriptionCreated, {
        subscriptionId: 's-new',
        memberId: 'm-1',
        memberCode: 'MEL-00042',
        firstName: 'Amira',
        lastName: 'Ben Salah',
        email: 'amira@example.com',
        phone: null,
        planName: 'Mensuel',
        startDate: TODAY,
        endDate: '2026-12-01',
        price: 90,
      });
    });

    it('keeps a partial payment amount', async () => {
      const { service, payments } = setup();
      await service.create({ memberId: 'm-1', planId: 'plan-1', payment: { method: PaymentMethod.D17, amount: 45, reference: 'D17-1' } });
      expect(payments.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 45, reference: 'D17-1' }));
    });

    it('republishes the access windows of the ACTIVE subscriptions', async () => {
      const current = sub({ startDate: '2026-10-10', endDate: '2026-11-08' });
      const { service, events } = setup({ active: [current] });
      await service.create({ memberId: 'm-1', planId: 'plan-1' });
      expect(events.publish).toHaveBeenCalledWith(EVENTS.entitlementChanged, {
        memberId: 'm-1',
        memberCode: 'MEL-00042',
        firstName: 'Amira',
        lastName: 'Ben Salah',
        status: MemberStatus.ACTIVE,
        windows: [{ from: '2026-10-10', until: '2026-11-08' }],
      });
    });
  });

  describe('update', () => {
    it('sends freezes to the freeze flow', async () => {
      const { service } = setup({ stored: sub({ startDate: '2026-10-10', endDate: '2026-11-08' }) });
      await expect(service.update({ id: 's-1', status: SubscriptionStatus.FROZEN })).rejects.toThrow(
        'Utilisez « Geler l’abonnement » pour une suspension temporaire.',
      );
    });

    it('refuses an end date before the start or malformed', async () => {
      const { service } = setup({ stored: sub({ startDate: '2026-10-10', endDate: '2026-11-08' }) });
      for (const endDate of ['2026-10-09', '8/11/2026']) {
        await expect(service.update({ id: 's-1', endDate })).rejects.toThrow(
          new BadRequestException('La date de fin doit être postérieure à la date de début.'),
        );
      }
    });

    it('moves the end date (one-day subscription allowed) and cancels', async () => {
      const { service, events } = setup({ stored: sub({ startDate: '2026-10-10', endDate: '2026-11-08' }) });
      expect(await service.update({ id: 's-1', endDate: '2026-10-10', status: SubscriptionStatus.CANCELLED })).toMatchObject({
        endDate: '2026-10-10',
        status: SubscriptionStatus.CANCELLED,
      });
      expect(events.publish).toHaveBeenCalledWith(EVENTS.entitlementChanged, expect.objectContaining({ memberId: 'm-1' }));
    });

    it('answers 404 for an unknown subscription', async () => {
      await expect(setup().service.update({ id: 's-x' })).rejects.toThrow(new NotFoundException('Abonnement introuvable.'));
    });
  });

  describe('freeze', () => {
    const active = () => sub({ startDate: '2026-10-10', endDate: '2026-11-08' });

    it('pauses an active subscription from today', async () => {
      const { service, saved } = setup({ stored: active() });
      expect(await service.freeze({ id: 's-1', days: 14, reason: 'Voyage' })).toMatchObject({ status: SubscriptionStatus.FROZEN });
      expect(saved()).toMatchObject({ frozenAt: TODAY, frozenDays: 14, freezeReason: 'Voyage', endDate: '2026-11-08' });
    });

    it('accepts 1 to 90 whole days', async () => {
      for (const days of [0, 91, 1.5, Number.NaN]) {
        await expect(setup({ stored: active() }).service.freeze({ id: 's-1', days })).rejects.toThrow(
          new BadRequestException('Durée de gel invalide (1 à 90 jours).'),
        );
      }
      await expect(setup({ stored: active() }).service.freeze({ id: 's-1', days: 90 })).resolves.toBeDefined();
      await expect(setup({ stored: active() }).service.freeze({ id: 's-1', days: 1 })).resolves.toBeDefined();
    });

    it('only freezes active subscriptions that have not ended', async () => {
      await expect(
        setup({ stored: sub({ status: SubscriptionStatus.EXPIRED, startDate: '2026-09-01', endDate: '2026-09-30' }) }).service.freeze({
          id: 's-1',
          days: 7,
        }),
      ).rejects.toThrow('Seul un abonnement actif peut être gelé.');
      await expect(
        setup({ stored: sub({ startDate: '2026-10-02', endDate: '2026-11-01' }) }).service.freeze({ id: 's-1', days: 7 }),
      ).rejects.toThrow('Cet abonnement est déjà terminé.');
      await expect(
        setup({ stored: sub({ startDate: '2026-10-04', endDate: TODAY }) }).service.freeze({ id: 's-1', days: 7 }),
      ).resolves.toBeDefined();
    });
  });

  describe('unfreeze', () => {
    it('refuses a subscription that is not frozen', async () => {
      await expect(setup({ stored: sub({ startDate: '2026-10-10', endDate: '2026-11-08' }) }).service.unfreeze({ id: 's-1' })).rejects.toThrow(
        new BadRequestException('Cet abonnement n’est pas gelé.'),
      );
    });

    it('pushes the end back by the days actually paused', async () => {
      const frozen = sub({ status: SubscriptionStatus.FROZEN, startDate: '2026-10-10', endDate: '2026-11-08', frozenAt: '2026-10-23', frozenDays: 14, freezeReason: 'Voyage' });
      const { service, saved } = setup({ stored: frozen });
      expect(await service.unfreeze({ id: 's-1' })).toMatchObject({ status: SubscriptionStatus.ACTIVE, endDate: '2026-11-18' });
      expect(saved()).toMatchObject({ frozenAt: null, frozenDays: null, freezeReason: null });
    });

    it('extends nothing when unfrozen the day it was frozen', async () => {
      const frozen = sub({ status: SubscriptionStatus.FROZEN, startDate: '2026-10-10', endDate: '2026-11-08', frozenAt: TODAY, frozenDays: 7 });
      expect((await setup({ stored: frozen }).service.unfreeze({ id: 's-1' })).endDate).toBe('2026-11-08');
    });

    it('counts a renewal frozen before it started only from its start', async () => {
      const started = sub({ status: SubscriptionStatus.FROZEN, startDate: '2026-10-30', endDate: '2026-11-28', frozenAt: '2026-10-25', frozenDays: 30 });
      expect((await setup({ stored: started }).service.unfreeze({ id: 's-1' })).endDate).toBe('2026-12-01');
      const notStarted = sub({ status: SubscriptionStatus.FROZEN, startDate: '2026-11-10', endDate: '2026-12-09', frozenAt: '2026-10-30', frozenDays: 30 });
      expect((await setup({ stored: notStarted }).service.unfreeze({ id: 's-1' })).endDate).toBe('2026-12-09');
    });
  });

  describe('publishEntitlement', () => {
    it('does nothing for a member that no longer exists', async () => {
      const { service, members, events } = setup();
      members.findOne.mockResolvedValue(null);
      await service.publishEntitlement('m-gone');
      expect(events.publish).not.toHaveBeenCalled();
    });
  });
});
