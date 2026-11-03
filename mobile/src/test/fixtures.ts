import type { ClassSessionDto, MemberDto, MemberProfile, MembershipState, SubscriptionDto } from '@/api/types';

/** Locales the app hands to Intl (INTL_LOCALES in src/i18n/index.tsx). */
export const LOCALES = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-TN-u-nu-latn' } as const;

export const ms = (iso: string) => new Date(iso).getTime();

/**
 * Tuesday 10 Nov 2026, 18:00-19:00 in Tunis, with the default booking policy: opens 7 days before,
 * closes at the start, free cancellation until 2 h before. 4 of 10 places taken, waitlist of 5.
 */
export function classSession(overrides: Partial<ClassSessionDto> = {}): ClassSessionDto {
  return {
    id: 'session-1',
    title: 'Cross Training',
    description: null,
    coachId: 'coach-1',
    coachName: 'Amine',
    room: 'Salle 1',
    color: null,
    startsAt: '2026-11-10T17:00:00.000Z',
    endsAt: '2026-11-10T18:00:00.000Z',
    capacity: 10,
    bookedCount: 4,
    spotsLeft: 6,
    waitlistCount: 0,
    waitlistCapacity: 5,
    spotSelection: false,
    takenSpots: [],
    bookingOpensAt: '2026-11-03T17:00:00.000Z',
    bookingClosesAt: '2026-11-10T17:00:00.000Z',
    cancelDeadline: '2026-11-10T15:00:00.000Z',
    ...overrides,
  };
}

export function subscription(overrides: Partial<SubscriptionDto> = {}): SubscriptionDto {
  return {
    id: 'sub-1',
    memberId: 'member-1',
    planId: 'plan-month',
    plan: { id: 'plan-month', name: 'Mensuel', durationDays: 30 },
    startDate: '2026-10-20',
    endDate: '2026-11-18',
    status: 'ACTIVE',
    price: 120,
    createdAt: '2026-10-20T08:00:00.000Z',
    ...overrides,
  };
}

/**
 * Profile as GET /api/me returns it. Membership defaults to "no plan"; pass the state the backend
 * would compute (membership-service computeMembershipState) for the subscriptions given.
 */
export function memberProfile(
  overrides: { member?: Partial<MemberDto>; membership?: Partial<MembershipState>; subscriptions?: SubscriptionDto[] } = {},
): MemberProfile {
  return {
    member: {
      id: 'member-1',
      memberCode: 'MEL-00042',
      firstName: 'Sami',
      lastName: 'Ben Ali',
      email: 'sami@example.com',
      phone: null,
      birthDate: null,
      gender: null,
      emergencyContact: null,
      notes: null,
      status: 'ACTIVE',
      joinedAt: '2026-01-15T10:00:00.000Z',
      photoUpdatedAt: null,
      ...overrides.member,
    },
    membership: {
      active: false,
      current: null,
      upcoming: null,
      daysLeft: null,
      validUntil: null,
      ...overrides.membership,
    },
    subscriptions: overrides.subscriptions ?? [],
    payments: [],
  };
}
