import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { EVENTS, EventBus, MemberStatus, PaymentMethod, Role, SubscriptionStatus } from '@app/common';
import { Member } from '../members/member.entity';
import { Plan } from '../plans/plan.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { Payment } from './payment.entity';
import { PaymentsService } from './payments.service';

const NOW = new Date('2026-11-02T09:00:00.000Z');
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
const subscription = Object.assign(new Subscription(), {
  id: 's-1',
  memberId: 'm-1',
  status: SubscriptionStatus.ACTIVE,
  plan: Object.assign(new Plan(), { id: 'plan-1', name: 'Mensuel', durationDays: 30, price: 90 }),
});

function listQuery() {
  const qb: Record<string, jest.Mock> = {};
  for (const method of ['leftJoinAndSelect', 'andWhere', 'select', 'orderBy', 'skip', 'take']) qb[method] = jest.fn(() => qb);
  qb.clone = jest.fn(() => qb);
  qb.getRawOne = jest.fn().mockResolvedValue({ sum: '1250.500' });
  qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  return qb;
}

function setup() {
  let stored: Payment | null = null;
  const qb = listQuery();
  const payments = {
    create: jest.fn((data: Partial<Payment>) => Object.assign(new Payment(), data)),
    save: jest.fn(async (row: Payment) => {
      stored = Object.assign(row, { id: 'pay-1', createdAt: NOW });
      return stored;
    }),
    findOneOrFail: jest.fn(async () => Object.assign(new Payment(), stored, { member, subscription: stored?.subscriptionId ? subscription : null })),
    createQueryBuilder: jest.fn(() => qb),
  };
  const members = { findOne: jest.fn().mockResolvedValue(member) };
  const subs = { findOne: jest.fn().mockResolvedValue(subscription) };
  const events = { publish: jest.fn() };
  const service = new PaymentsService(
    payments as unknown as Repository<Payment>,
    members as unknown as Repository<Member>,
    subs as unknown as Repository<Subscription>,
    events as unknown as EventBus,
  );
  return { service, payments, members, subs, events, qb };
}

describe('PaymentsService', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  describe('create', () => {
    it.each([0, -10, Number.NaN])('refuses an amount of %p', async (amount) => {
      await expect(setup().service.create({ memberId: 'm-1', amount, method: PaymentMethod.CASH })).rejects.toThrow(
        new BadRequestException('Le montant doit être positif.'),
      );
    });

    it('refuses an unknown member and a subscription of another member', async () => {
      const unknown = setup();
      unknown.members.findOne.mockResolvedValue(null);
      await expect(unknown.service.create({ memberId: 'm-x', amount: 90, method: PaymentMethod.CASH })).rejects.toThrow(
        new NotFoundException('Membre introuvable.'),
      );
      const foreign = setup();
      foreign.subs.findOne.mockResolvedValue(null);
      await expect(
        foreign.service.create({ memberId: 'm-1', amount: 90, method: PaymentMethod.CASH, subscriptionId: 's-other' }),
      ).rejects.toThrow('Cet abonnement n’appartient pas à ce membre.');
      expect(foreign.subs.findOne).toHaveBeenCalledWith({ where: { id: 's-other', memberId: 'm-1' } });
    });

    it('accepts a payment received earlier, or up to one minute ahead of the server clock', async () => {
      const { service, payments } = setup();
      await service.create({ memberId: 'm-1', amount: 90, method: PaymentMethod.CASH, paidAt: '2026-10-30T16:00:00.000Z' });
      expect(payments.create).toHaveBeenLastCalledWith(expect.objectContaining({ paidAt: new Date('2026-10-30T16:00:00.000Z') }));
      await service.create({ memberId: 'm-1', amount: 90, method: PaymentMethod.CASH, paidAt: '2026-11-02T09:00:59.000Z' });
      expect(payments.create).toHaveBeenLastCalledWith(expect.objectContaining({ paidAt: new Date('2026-11-02T09:00:59.000Z') }));
    });

    it('refuses a future or unreadable payment date', async () => {
      for (const paidAt of ['2026-11-02T09:01:01.000Z', 'hier']) {
        await expect(setup().service.create({ memberId: 'm-1', amount: 90, method: PaymentMethod.CASH, paidAt })).rejects.toThrow(
          new BadRequestException('Date de paiement invalide.'),
        );
      }
    });

    it('rounds to the millime, records who received it and announces it', async () => {
      const { service, payments, events } = setup();
      const dto = await service.create({
        memberId: 'm-1',
        amount: 76.50049,
        method: PaymentMethod.D17,
        reference: 'D17-778899',
        subscriptionId: 's-1',
        actor,
      });
      expect(payments.create).toHaveBeenCalledWith({
        memberId: 'm-1',
        subscriptionId: 's-1',
        amount: 76.5,
        method: PaymentMethod.D17,
        reference: 'D17-778899',
        paidAt: NOW,
        receivedById: 'u-staff',
        receivedByName: 'Sami',
      });
      expect(dto).toMatchObject({ id: 'pay-1', memberName: 'Amira Ben Salah', planName: 'Mensuel', amount: 76.5 });
      expect(events.publish).toHaveBeenCalledWith(EVENTS.paymentReceived, {
        paymentId: 'pay-1',
        memberId: 'm-1',
        memberCode: 'MEL-00042',
        firstName: 'Amira',
        lastName: 'Ben Salah',
        email: 'amira@example.com',
        amount: 76.5,
        method: PaymentMethod.D17,
        reference: 'D17-778899',
        planName: 'Mensuel',
        paidAt: NOW.toISOString(),
      });
    });

    it('stores a payment without subscription or reference as null', async () => {
      const { service, payments } = setup();
      await service.create({ memberId: 'm-1', amount: 20, method: PaymentMethod.CASH });
      expect(payments.create).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionId: null, reference: null, receivedById: null, receivedByName: null }),
      );
    });
  });

  describe('list', () => {
    it('includes the whole gym day of `to` and clamps the paging', async () => {
      const { service, qb } = setup();
      const page = await service.list({ to: '2026-11-02', page: 0, pageSize: 1000 });
      expect(qb.andWhere).toHaveBeenCalledWith('p.paidAt <= :to', { to: new Date(2026, 10, 2, 23, 59, 59, 999) });
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(200);
      expect(page).toEqual({ items: [], total: 0, page: 1, pageSize: 200, sum: 1250.5 });
    });

    it('uses an exact `to` instant as given', async () => {
      const { service, qb } = setup();
      await service.list({ to: '2026-11-02T12:00:00.000Z', pageSize: 0 });
      expect(qb.andWhere).toHaveBeenCalledWith('p.paidAt <= :to', { to: new Date('2026-11-02T12:00:00.000Z') });
      expect(qb.take).toHaveBeenCalledWith(1);
    });
  });
});
