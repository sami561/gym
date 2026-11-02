import { MemberStatus, SubscriptionDto, SubscriptionStatus } from '@app/common';
import { computeMembershipState } from './membership-state';

function sub(startDate: string, endDate: string, status = SubscriptionStatus.ACTIVE): SubscriptionDto {
  return {
    id: `${startDate}-${endDate}`,
    memberId: 'm1',
    planId: 'p1',
    plan: { id: 'p1', name: 'Mensuel', durationDays: 30 },
    startDate,
    endDate,
    status,
    price: 90,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('computeMembershipState', () => {
  const today = '2026-11-02';

  it('is active inside a window and counts today in daysLeft', () => {
    const state = computeMembershipState(MemberStatus.ACTIVE, [sub('2026-10-10', '2026-11-08')], today);
    expect(state.active).toBe(true);
    expect(state.validUntil).toBe('2026-11-08');
    expect(state.daysLeft).toBe(7);
  });

  it('chains a renewal paid in advance', () => {
    const state = computeMembershipState(
      MemberStatus.ACTIVE,
      [sub('2026-10-10', '2026-11-08'), sub('2026-11-09', '2026-12-08')],
      today,
    );
    expect(state.validUntil).toBe('2026-12-08');
    expect(state.upcoming?.startDate).toBe('2026-11-09');
  });

  it('is inactive when expired, frozen or suspended', () => {
    expect(computeMembershipState(MemberStatus.ACTIVE, [sub('2026-09-01', '2026-10-31')], today).active).toBe(false);
    expect(
      computeMembershipState(MemberStatus.ACTIVE, [sub('2026-10-10', '2026-11-08', SubscriptionStatus.FROZEN)], today)
        .active,
    ).toBe(false);
    expect(computeMembershipState(MemberStatus.SUSPENDED, [sub('2026-10-10', '2026-11-08')], today).active).toBe(false);
  });
});
