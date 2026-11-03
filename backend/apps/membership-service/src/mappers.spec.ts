import {
  Gender,
  LeadActivityType,
  LeadSource,
  LeadStatus,
  MemberStatus,
  PaymentMethod,
  PromoType,
  SubscriptionStatus,
} from '@app/common';
import { toLeadDto, toMemberDto, toPaymentDto, toPlanDto, toPromoDto, toSubscriptionDto } from './mappers';
import { Member } from './members/member.entity';
import { Plan } from './plans/plan.entity';
import { Subscription } from './subscriptions/subscription.entity';
import { Payment } from './payments/payment.entity';
import { PromoCode } from './promos/promo.entity';
import { Lead, LeadActivity } from './leads/lead.entity';

const at = new Date('2026-11-02T09:15:00.000Z');

const member = (): Member =>
  Object.assign(new Member(), {
    id: 'm-1',
    memberCode: 'MEL-00042',
    firstName: 'Amira',
    lastName: 'Ben Salah',
    email: 'amira@example.com',
    phone: '+216 20 000 000',
    birthDate: '1996-11-02',
    gender: Gender.FEMALE,
    emergencyContact: null,
    notes: null,
    status: MemberStatus.ACTIVE,
    photoUpdatedAt: null,
    joinedAt: at,
    updatedAt: at,
    subscriptions: [],
    payments: [],
  });

const plan = (): Plan =>
  Object.assign(new Plan(), {
    id: 'p-1',
    name: 'Mensuel',
    description: 'Accès illimité',
    durationDays: 30,
    price: 90,
    features: ['Plateau', 'Cardio'],
    isFeatured: true,
    isActive: true,
    sortOrder: 1,
    createdAt: at,
  });

const subscription = (): Subscription =>
  Object.assign(new Subscription(), {
    id: 's-1',
    memberId: 'm-1',
    member: member(),
    planId: 'p-1',
    plan: plan(),
    startDate: '2026-11-02',
    endDate: '2026-12-01',
    status: SubscriptionStatus.ACTIVE,
    price: 76.5,
    promoCode: 'ETE26',
    discount: 13.5,
    frozenAt: null,
    frozenDays: null,
    freezeReason: null,
    reminderSentAt: null,
    createdAt: at,
  });

describe('membership mappers', () => {
  it('maps a member to its public fields only', () => {
    expect(toMemberDto(member())).toEqual({
      id: 'm-1',
      memberCode: 'MEL-00042',
      firstName: 'Amira',
      lastName: 'Ben Salah',
      email: 'amira@example.com',
      phone: '+216 20 000 000',
      birthDate: '1996-11-02',
      gender: Gender.FEMALE,
      emergencyContact: null,
      notes: null,
      status: MemberStatus.ACTIVE,
      joinedAt: '2026-11-02T09:15:00.000Z',
      photoUpdatedAt: null,
    });
  });

  it('gives the photo version as an ISO instant, null without photo or right after an insert', () => {
    const withPhoto = Object.assign(member(), { photoUpdatedAt: new Date('2026-11-03T09:00:00.001Z') });
    expect(toMemberDto(withPhoto).photoUpdatedAt).toBe('2026-11-03T09:00:00.001Z');
    // insert: false — save() leaves the property undefined on a member it just created
    expect(toMemberDto(Object.assign(member(), { photoUpdatedAt: undefined })).photoUpdatedAt).toBeNull();
  });

  it('maps a plan, with no features as an empty list', () => {
    expect(toPlanDto(plan())).toEqual({
      id: 'p-1',
      name: 'Mensuel',
      description: 'Accès illimité',
      durationDays: 30,
      price: 90,
      features: ['Plateau', 'Cardio'],
      isFeatured: true,
      isActive: true,
      sortOrder: 1,
    });
    expect(toPlanDto(Object.assign(plan(), { features: null })).features).toEqual([]);
  });

  it('keeps a plan summary on subscriptions and leaves out promo, freeze and reminder internals', () => {
    expect(toSubscriptionDto(subscription())).toEqual({
      id: 's-1',
      memberId: 'm-1',
      planId: 'p-1',
      plan: { id: 'p-1', name: 'Mensuel', durationDays: 30 },
      startDate: '2026-11-02',
      endDate: '2026-12-01',
      status: SubscriptionStatus.ACTIVE,
      price: 76.5,
      createdAt: '2026-11-02T09:15:00.000Z',
    });
  });

  describe('toPaymentDto', () => {
    const payment = (): Payment =>
      Object.assign(new Payment(), {
        id: 'pay-1',
        memberId: 'm-1',
        subscriptionId: 's-1',
        amount: 76.5,
        method: PaymentMethod.D17,
        reference: 'D17-778899',
        paidAt: at,
        receivedById: 'u-staff',
        receivedByName: 'Sami',
        createdAt: at,
      });

    it('names the member and the plan from the relations', () => {
      expect(toPaymentDto(Object.assign(payment(), { member: member(), subscription: subscription() }))).toEqual({
        id: 'pay-1',
        memberId: 'm-1',
        memberName: 'Amira Ben Salah',
        memberCode: 'MEL-00042',
        subscriptionId: 's-1',
        planName: 'Mensuel',
        amount: 76.5,
        method: PaymentMethod.D17,
        reference: 'D17-778899',
        paidAt: '2026-11-02T09:15:00.000Z',
        receivedById: 'u-staff',
        receivedByName: 'Sami',
      });
    });

    it('falls back to empty names when the relations were not loaded', () => {
      expect(toPaymentDto(Object.assign(payment(), { subscriptionId: null, subscription: null }))).toMatchObject({
        memberName: '',
        memberCode: '',
        planName: null,
      });
    });
  });

  it('maps a promo code', () => {
    const promo = Object.assign(new PromoCode(), {
      id: 'promo-1',
      code: 'ETE26',
      type: PromoType.PERCENT,
      value: 15,
      validFrom: '2026-06-01',
      validUntil: '2026-08-31',
      maxUses: 50,
      uses: 12,
      isActive: true,
      description: 'Offre été',
      createdAt: at,
    });
    expect(toPromoDto(promo)).toEqual({
      id: 'promo-1',
      code: 'ETE26',
      type: PromoType.PERCENT,
      value: 15,
      validFrom: '2026-06-01',
      validUntil: '2026-08-31',
      maxUses: 50,
      uses: 12,
      isActive: true,
      description: 'Offre été',
    });
  });

  describe('toLeadDto', () => {
    const activity = (id: string, iso: string): LeadActivity =>
      Object.assign(new LeadActivity(), { id, leadId: 'l-1', type: LeadActivityType.CALL, note: null, byName: 'Sami', at: new Date(iso) });
    const lead = (activities?: LeadActivity[]): Lead =>
      Object.assign(new Lead(), {
        id: 'l-1',
        firstName: 'Yassine',
        lastName: 'Trabelsi',
        phone: null,
        email: 'yassine@example.com',
        source: LeadSource.INSTAGRAM,
        status: LeadStatus.TRIAL,
        interestPlanId: 'p-1',
        interestPlanName: 'Mensuel',
        trialDate: '2026-11-05',
        followUpAt: null,
        notes: null,
        assignedToName: 'Sami',
        convertedMemberId: null,
        closedAt: null,
        createdAt: at,
        updatedAt: at,
        activities,
      });

    it('leaves activities out unless asked', () => {
      expect(toLeadDto(lead([activity('a-1', '2026-11-01T10:00:00Z')]))).not.toHaveProperty('activities');
    });

    it('lists activities newest first', () => {
      const dto = toLeadDto(
        lead([activity('a-1', '2026-11-01T10:00:00Z'), activity('a-3', '2026-11-03T10:00:00Z'), activity('a-2', '2026-11-02T10:00:00Z')]),
        true,
      );
      expect(dto.activities?.map((a) => a.id)).toEqual(['a-3', 'a-2', 'a-1']);
      expect(dto.activities?.[0]).toEqual({ id: 'a-3', type: LeadActivityType.CALL, note: null, byName: 'Sami', at: '2026-11-03T10:00:00.000Z' });
      expect(toLeadDto(lead(undefined), true).activities).toEqual([]);
    });
  });
});
