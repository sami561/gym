import { InactiveMember, LastVisit, Recipient } from '@app/common';

const DAY_MS = 86_400_000;

/**
 * Active members whose last visit is at least `days` days old; members who never came count
 * as inactive (lastVisitAt/daysSinceVisit null) and are listed first, then the longest absent.
 */
export function composeInactiveMembers(
  recipients: Recipient[],
  visits: LastVisit[],
  days: number,
  now: Date = new Date(),
): InactiveMember[] {
  const lastVisit = new Map(visits.map((v) => [v.memberId, v.lastVisitAt]));
  return recipients
    .map((recipient): InactiveMember => {
      const lastVisitAt = lastVisit.get(recipient.memberId) ?? null;
      const daysSinceVisit = lastVisitAt
        ? Math.max(0, Math.floor((now.getTime() - new Date(lastVisitAt).getTime()) / DAY_MS))
        : null;
      return { ...recipient, lastVisitAt, daysSinceVisit };
    })
    .filter((member) => member.daysSinceVisit === null || member.daysSinceVisit >= days)
    .sort(
      (a, b) =>
        (b.daysSinceVisit ?? Number.MAX_SAFE_INTEGER) - (a.daysSinceVisit ?? Number.MAX_SAFE_INTEGER),
    );
}
