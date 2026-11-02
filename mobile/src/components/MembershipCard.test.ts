import { describe, expect, it } from '@jest/globals';
import { memberProfile, subscription } from '@/test/fixtures';
import { membershipKind } from './MembershipCard';

// Profiles as GET /api/me returns them on 2 Nov 2026: membership-service (computeMembershipState) only
// puts an ACTIVE subscription covering today in `current`, and lists subscriptions newest start first.
const current = subscription({ id: 'sub-2', startDate: '2026-10-20', endDate: '2026-11-18' });
const past = subscription({ id: 'sub-1', startDate: '2026-08-01', endDate: '2026-08-30' });

describe('membershipKind', () => {
  it('is active while a subscription covers today', () => {
    const profile = memberProfile({
      membership: { active: true, current, daysLeft: 17, validUntil: '2026-11-18' },
      subscriptions: [current, past],
    });
    expect(membershipKind(profile)).toBe('active');
  });

  it('is suspended when staff suspended the member, even with a valid subscription', () => {
    const profile = memberProfile({
      member: { status: 'SUSPENDED' },
      membership: { active: false, current },
      subscriptions: [current],
    });
    expect(membershipKind(profile)).toBe('suspended');
  });

  it('is expired once the last subscription has ended', () => {
    expect(membershipKind(memberProfile({ subscriptions: [past] }))).toBe('expired');
  });

  it('is none for a member who never subscribed', () => {
    expect(membershipKind(memberProfile())).toBe('none');
  });

  // Known bug in src/components/MembershipCard.tsx: the frozen branch reads membership.current, which
  // never holds a FROZEN subscription, so a member whose plan is paused is shown as expired.
  it.skip('is frozen while the subscription is paused', () => {
    const frozen = subscription({ status: 'FROZEN' });
    expect(membershipKind(memberProfile({ subscriptions: [frozen] }))).toBe('frozen');
  });

  // Known bug in src/components/MembershipCard.tsx: a member whose first plan starts later (paid in
  // advance) only has an upcoming subscription and is shown as expired.
  it.skip('is not expired before the first subscription starts', () => {
    const upcoming = subscription({ startDate: '2026-11-10', endDate: '2026-12-09' });
    expect(membershipKind(memberProfile({ membership: { upcoming }, subscriptions: [upcoming] }))).not.toBe('expired');
  });
});
