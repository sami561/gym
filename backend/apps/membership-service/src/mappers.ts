import {
  LeadActivityDto,
  LeadDto,
  MemberDto,
  PaymentDto,
  PlanDto,
  PromoCodeDto,
  SubscriptionDto,
  fullName,
} from '@app/common';
import { Member } from './members/member.entity';
import { Plan } from './plans/plan.entity';
import { Subscription } from './subscriptions/subscription.entity';
import { Payment } from './payments/payment.entity';
import { PromoCode } from './promos/promo.entity';
import { Lead, LeadActivity } from './leads/lead.entity';

export function toMemberDto(m: Member): MemberDto {
  return {
    id: m.id,
    memberCode: m.memberCode,
    firstName: m.firstName,
    lastName: m.lastName,
    email: m.email,
    phone: m.phone,
    birthDate: m.birthDate,
    gender: m.gender,
    emergencyContact: m.emergencyContact,
    notes: m.notes,
    status: m.status,
    joinedAt: m.joinedAt.toISOString(),
    photoUpdatedAt: m.photoUpdatedAt ? m.photoUpdatedAt.toISOString() : null,
  };
}

export function toPlanDto(p: Plan): PlanDto {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    durationDays: p.durationDays,
    price: p.price,
    features: p.features ?? [],
    isFeatured: p.isFeatured,
    isActive: p.isActive,
    sortOrder: p.sortOrder,
  };
}

export function toSubscriptionDto(s: Subscription): SubscriptionDto {
  return {
    id: s.id,
    memberId: s.memberId,
    planId: s.planId,
    plan: { id: s.plan.id, name: s.plan.name, durationDays: s.plan.durationDays },
    startDate: s.startDate,
    endDate: s.endDate,
    status: s.status,
    price: s.price,
    createdAt: s.createdAt.toISOString(),
  };
}

export function toPaymentDto(p: Payment): PaymentDto {
  return {
    id: p.id,
    memberId: p.memberId,
    memberName: p.member ? fullName(p.member) : '',
    memberCode: p.member?.memberCode ?? '',
    subscriptionId: p.subscriptionId,
    planName: p.subscription?.plan?.name ?? null,
    amount: p.amount,
    method: p.method,
    reference: p.reference,
    paidAt: p.paidAt.toISOString(),
    receivedById: p.receivedById,
    receivedByName: p.receivedByName,
  };
}

export function toPromoDto(p: PromoCode): PromoCodeDto {
  return {
    id: p.id,
    code: p.code,
    type: p.type,
    value: p.value,
    validFrom: p.validFrom,
    validUntil: p.validUntil,
    maxUses: p.maxUses,
    uses: p.uses,
    isActive: p.isActive,
    description: p.description,
  };
}

export function toLeadActivityDto(a: LeadActivity): LeadActivityDto {
  return { id: a.id, type: a.type, note: a.note, byName: a.byName, at: a.at.toISOString() };
}

export function toLeadDto(l: Lead, withActivities = false): LeadDto {
  return {
    id: l.id,
    firstName: l.firstName,
    lastName: l.lastName,
    phone: l.phone,
    email: l.email,
    source: l.source,
    status: l.status,
    interestPlanId: l.interestPlanId,
    interestPlanName: l.interestPlanName,
    trialDate: l.trialDate,
    followUpAt: l.followUpAt,
    notes: l.notes,
    assignedToName: l.assignedToName,
    convertedMemberId: l.convertedMemberId,
    createdAt: l.createdAt.toISOString(),
    ...(withActivities
      ? {
          activities: (l.activities ?? [])
            .sort((a, b) => b.at.getTime() - a.at.getTime())
            .map(toLeadActivityDto),
        }
      : {}),
  };
}
