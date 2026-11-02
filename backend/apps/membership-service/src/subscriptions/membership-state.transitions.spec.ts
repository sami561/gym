import { MemberStatus, SubscriptionDto, SubscriptionStatus } from '@app/common';
import { accessWindows, computeMembershipState } from './membership-state';

const TODAY = '2026-11-02';

function sub(id: string, startDate: string, endDate: string, status = SubscriptionStatus.ACTIVE): SubscriptionDto {
  return {
    id,
    memberId: 'm-1',
    planId: 'p-1',
    plan: { id: 'p-1', name: 'Mensuel', durationDays: 30 },
    startDate,
    endDate,
    status,
    price: 90,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('membership state transitions', () => {
  describe('accessWindows', () => {
    it('opens the doors for ACTIVE subscriptions only', () => {
      expect(
        accessWindows([
          sub('a', '2026-10-10', '2026-11-08'),
          sub('f', '2026-11-09', '2026-12-08', SubscriptionStatus.FROZEN),
          sub('e', '2026-09-01', '2026-09-30', SubscriptionStatus.EXPIRED),
          sub('c', '2026-12-09', '2027-01-07', SubscriptionStatus.CANCELLED),
        ]),
      ).toEqual([{ from: '2026-10-10', until: '2026-11-08' }]);
    });
  });

  it('has no access and no dates without subscriptions', () => {
    expect(computeMembershipState(MemberStatus.ACTIVE, [], TODAY)).toEqual({
      active: false,
      current: null,
      upcoming: null,
      daysLeft: null,
      validUntil: null,
    });
  });

  it('is active on the first and on the last day, which counts as 1 day left', () => {
    expect(computeMembershipState(MemberStatus.ACTIVE, [sub('a', TODAY, '2026-12-01')], TODAY)).toMatchObject({ active: true, daysLeft: 30 });
    expect(computeMembershipState(MemberStatus.ACTIVE, [sub('a', '2026-10-04', TODAY)], TODAY)).toMatchObject({
      active: true,
      daysLeft: 1,
      validUntil: TODAY,
    });
  });

  it('loses access while frozen (the paused subscription is no longer current)', () => {
    expect(
      computeMembershipState(MemberStatus.ACTIVE, [sub('a', '2026-10-10', '2026-11-08', SubscriptionStatus.FROZEN)], TODAY),
    ).toEqual({ active: false, current: null, upcoming: null, daysLeft: null, validUntil: null });
  });

  it('keeps the paid dates of a suspended member but no access and no countdown', () => {
    const state = computeMembershipState(MemberStatus.SUSPENDED, [sub('a', '2026-10-10', '2026-11-08')], TODAY);
    expect(state).toMatchObject({ active: false, daysLeft: null, validUntil: '2026-11-08' });
    expect(state.current?.id).toBe('a');
  });

  it('loses access when the current subscription is cancelled', () => {
    expect(
      computeMembershipState(MemberStatus.ACTIVE, [sub('a', '2026-10-10', '2026-11-08', SubscriptionStatus.CANCELLED)], TODAY).active,
    ).toBe(false);
  });

  it('takes the overlapping subscription ending last as current', () => {
    const state = computeMembershipState(
      MemberStatus.ACTIVE,
      [sub('short', '2026-10-20', '2026-11-05'), sub('long', '2026-10-01', '2026-12-31')],
      TODAY,
    );
    expect(state.current?.id).toBe('long');
    expect(state.validUntil).toBe('2026-12-31');
  });

  it('counts only uninterrupted days when the renewal leaves a gap, and still shows the renewal', () => {
    const state = computeMembershipState(
      MemberStatus.ACTIVE,
      [sub('next', '2026-11-12', '2026-12-11'), sub('now', '2026-10-10', '2026-11-08')],
      TODAY,
    );
    expect(state).toMatchObject({ active: true, validUntil: '2026-11-08', daysLeft: 7 });
    expect(state.upcoming?.id).toBe('next');
  });

  it('shows the earliest ACTIVE renewal as upcoming, ignoring frozen ones', () => {
    const state = computeMembershipState(
      MemberStatus.ACTIVE,
      [
        sub('later', '2027-01-08', '2027-02-06'),
        sub('frozen', '2026-11-09', '2026-12-08', SubscriptionStatus.FROZEN),
        sub('next', '2026-12-09', '2027-01-07'),
      ],
      TODAY,
    );
    expect(state.active).toBe(false);
    expect(state.upcoming?.id).toBe('next');
    expect(state.validUntil).toBeNull();
  });
});
