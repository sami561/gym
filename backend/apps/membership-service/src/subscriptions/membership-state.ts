import {
  DateWindow,
  MembershipState,
  MemberStatus,
  SubscriptionDto,
  SubscriptionStatus,
  diffDays,
  lastCoveredDay,
  toDateOnly,
} from '@app/common';

/** Windows that grant door access: ACTIVE subscriptions only (FROZEN ones are paused). */
export function accessWindows(subs: Pick<SubscriptionDto, 'status' | 'startDate' | 'endDate'>[]): DateWindow[] {
  return subs
    .filter((s) => s.status === SubscriptionStatus.ACTIVE)
    .map((s) => ({ from: s.startDate, until: s.endDate }));
}

export function computeMembershipState(
  memberStatus: MemberStatus,
  subs: SubscriptionDto[],
  today: string = toDateOnly(),
): MembershipState {
  const active = subs.filter((s) => s.status === SubscriptionStatus.ACTIVE);
  const current =
    active
      .filter((s) => s.startDate <= today && today <= s.endDate)
      .sort((a, b) => b.endDate.localeCompare(a.endDate))[0] ?? null;
  const upcoming =
    active.filter((s) => s.startDate > today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;
  const validUntil = current ? lastCoveredDay(accessWindows(subs), today) : null;
  const isActive = memberStatus === MemberStatus.ACTIVE && current !== null;
  return {
    active: isActive,
    current,
    upcoming,
    daysLeft: isActive && validUntil ? diffDays(today, validUntil) + 1 : null,
    validUntil,
  };
}
