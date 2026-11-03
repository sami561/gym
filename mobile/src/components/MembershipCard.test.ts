import { describe, expect, it } from '@jest/globals';
import { translate } from '@/i18n';
import { memberProfile, subscription } from '@/test/fixtures';
import { appSources } from '@/test/source';
import { membershipKind, membershipTone, statusSubscription, type MembershipKind } from './MembershipCard';

// Profiles as GET /api/me returns them on 2 Nov 2026: membership-service (computeMembershipState) only
// puts an ACTIVE subscription covering today in `current`, and lists subscriptions newest start first.
const current = subscription({ id: 'sub-2', startDate: '2026-10-20', endDate: '2026-11-18' });
const past = subscription({ id: 'sub-1', startDate: '2026-08-01', endDate: '2026-08-30' });

// Every kind: the type check flags one missing here.
const kinds = Object.keys({
  active: true,
  frozen: true,
  scheduled: true,
  expired: true,
  suspended: true,
  none: true,
} satisfies Record<MembershipKind, true>) as MembershipKind[];

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

  // computeMembershipState never puts a FROZEN subscription in `current`: the freeze is read from the list.
  it('is frozen while the subscription is paused', () => {
    const frozen = subscription({ status: 'FROZEN' });
    expect(membershipKind(memberProfile({ subscriptions: [frozen] }))).toBe('frozen');
  });

  it('stays frozen past the end date until the freeze ends', () => {
    // Frozen on 25 Oct for 30 days: membership-service pushes the end date back only when it resumes.
    const frozen = subscription({ id: 'sub-2', status: 'FROZEN', startDate: '2026-10-01', endDate: '2026-10-30' });
    expect(membershipKind(memberProfile({ subscriptions: [frozen, past] }))).toBe('frozen');
  });

  it('is frozen, not scheduled, while a renewal paid in advance waits behind the paused subscription', () => {
    const frozen = subscription({ id: 'sub-2', status: 'FROZEN' });
    const renewal = subscription({ id: 'sub-3', startDate: '2026-11-19', endDate: '2026-12-18' });
    const profile = memberProfile({ membership: { upcoming: renewal }, subscriptions: [renewal, frozen] });
    expect(membershipKind(profile)).toBe('frozen');
  });

  it('is active when only the renewal paid in advance is frozen', () => {
    const renewal = subscription({ id: 'sub-3', status: 'FROZEN', startDate: '2026-11-19', endDate: '2026-12-18' });
    const profile = memberProfile({
      membership: { active: true, current, daysLeft: 17, validUntil: '2026-11-18' },
      subscriptions: [renewal, current],
    });
    expect(membershipKind(profile)).toBe('active');
  });

  // Paid in advance: computeMembershipState sets `upcoming`, not `current`, until the start date.
  it('is not expired before the first subscription starts', () => {
    const upcoming = subscription({ startDate: '2026-11-10', endDate: '2026-12-09' });
    expect(membershipKind(memberProfile({ membership: { upcoming }, subscriptions: [upcoming] }))).not.toBe('expired');
  });

  it('is scheduled until the subscription paid in advance starts, even after an earlier one ended', () => {
    const upcoming = subscription({ id: 'sub-2', startDate: '2026-11-10', endDate: '2026-12-09' });
    const membership = { upcoming };
    expect(membershipKind(memberProfile({ membership, subscriptions: [upcoming] }))).toBe('scheduled');
    expect(membershipKind(memberProfile({ membership, subscriptions: [upcoming, past] }))).toBe('scheduled');
  });

  it('is suspended rather than frozen or scheduled', () => {
    const member = { status: 'SUSPENDED' } as const;
    const frozen = subscription({ status: 'FROZEN' });
    const upcoming = subscription({ id: 'sub-3', startDate: '2026-11-19', endDate: '2026-12-18' });
    expect(membershipKind(memberProfile({ member, subscriptions: [frozen] }))).toBe('suspended');
    const paidInAdvance = memberProfile({ member, membership: { upcoming }, subscriptions: [upcoming] });
    expect(membershipKind(paidInAdvance)).toBe('suspended');
  });
});

describe('statusSubscription', () => {
  it('is the running subscription, else the paused one, else the one paid in advance', () => {
    const frozen = subscription({ id: 'sub-2', status: 'FROZEN', startDate: '2026-10-01', endDate: '2026-10-30' });
    const renewal = subscription({ id: 'sub-3', startDate: '2026-11-19', endDate: '2026-12-18' });
    const running = memberProfile({
      membership: { active: true, current, upcoming: renewal },
      subscriptions: [renewal, current],
    });
    expect(statusSubscription(running)).toBe(current);
    const membership = { upcoming: renewal };
    expect(statusSubscription(memberProfile({ membership, subscriptions: [renewal, frozen] }))).toBe(frozen);
    expect(statusSubscription(memberProfile({ membership, subscriptions: [renewal, past] }))).toBe(renewal);
  });

  // «Expiré le» shows its end date, as the back-office member list does (membership-service MembersService.list).
  it('once expired, is the subscription that ended last, never a cancelled one', () => {
    // A renewal paid in advance, then cancelled at the front desk: its dates are still ahead.
    const cancelled = subscription({ id: 'sub-3', status: 'CANCELLED', startDate: '2026-11-19', endDate: '2026-12-18' });
    const ended = subscription({ id: 'sub-2', status: 'EXPIRED', startDate: '2026-09-20', endDate: '2026-10-19' });
    const profile = memberProfile({ subscriptions: [cancelled, ended, past] });
    expect(membershipKind(profile)).toBe('expired');
    expect(statusSubscription(profile)).toBe(ended);
  });

  it('goes by end date, not by start date', () => {
    // Staff set the dates: the newer subscription ended before the older, longer one.
    const quarter = subscription({ id: 'sub-1', status: 'EXPIRED', startDate: '2026-08-01', endDate: '2026-10-29' });
    const twoWeeks = subscription({ id: 'sub-2', status: 'EXPIRED', startDate: '2026-09-01', endDate: '2026-09-14' });
    expect(statusSubscription(memberProfile({ subscriptions: [twoWeeks, quarter] }))).toBe(quarter);
  });

  it('counts a subscription past its end date the scheduler has not expired yet', () => {
    const notYetExpired = subscription({ id: 'sub-2', startDate: '2026-10-01', endDate: '2026-10-30' });
    expect(statusSubscription(memberProfile({ subscriptions: [notYetExpired, past] }))).toBe(notYetExpired);
  });

  it('is none when every subscription was cancelled, so no expiry date is shown', () => {
    const cancelled = subscription({ status: 'CANCELLED', startDate: '2026-11-19', endDate: '2026-12-18' });
    expect(statusSubscription(memberProfile({ subscriptions: [cancelled] }))).toBeNull();
    expect(statusSubscription(memberProfile())).toBeNull();
  });
});

describe('membershipTone', () => {
  it('keeps danger for a lapsed membership or a suspended member', () => {
    expect(membershipTone.active).toBe('success');
    expect(membershipTone.none).toBe('neutral');
    expect(kinds.filter((kind) => membershipTone[kind] === 'danger').sort()).toEqual(['expired', 'suspended']);
  });

  it('shows a subscription paid in advance like a paused one, as information', () => {
    expect(membershipTone.scheduled).toBe('info');
    expect(membershipTone.frozen).toBe('info');
  });

  // The pass screen once picked its own colours and showed a subscription paid in advance in red.
  it('colours the membership pill on the card and on the pass screen alike', () => {
    const pills = appSources()
      .filter(({ text }) => /\bmembershipKind\(/.test(text))
      .flatMap(({ path, text }) =>
        Array.from(text.matchAll(/<StatusPill\b[^>]*?\btone=\{([^}]*)\}/g), ([, tone]) => ({ path, tone: tone.trim() })),
      );
    expect(pills.map(({ path }) => path)).toEqual(
      expect.arrayContaining(['app/(tabs)/pass.tsx', 'components/MembershipCard.tsx']),
    );
    expect(pills.filter(({ tone }) => tone !== 'membershipTone[kind]')).toEqual([]);
  });
});

describe('membership status labels', () => {
  // The card and the pass screen show t(`membership.${kind}`) as the status pill, without parameters.
  it.each(kinds)('labels %s in every language, without placeholders', (kind) => {
    for (const lang of ['fr', 'en', 'ar'] as const) {
      const label = translate(lang, `membership.${kind}` as const);
      expect(label).not.toBe(`membership.${kind}`);
      expect(label).not.toMatch(/[{}]/);
    }
  });
});
