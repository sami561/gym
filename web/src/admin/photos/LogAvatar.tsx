import clsx from 'clsx';
import { DoorOpen, UserRound } from 'lucide-react';
import type { AccessLogDto } from '../../api/types';
import { MemberAvatar } from './MemberAvatar';

/**
 * Leading picture of an access-log row: the member's photo (latest, only the id is known), else a
 * door for a manual opening or a blank person for an unknown code. `showResult` adds the
 * granted/denied dot; the row says it in words too.
 */
export function LogAvatar({ log, showResult = false }: { log: AccessLogDto; showResult?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0">
      {log.memberId ? (
        <MemberAvatar memberId={log.memberId} name={log.memberName ?? ''} photoUpdatedAt={undefined} size="sm" decorative />
      ) : (
        <span className="flex size-8 items-center justify-center rounded-md bg-card-2 text-muted ring-1 ring-line" aria-hidden>
          {log.method === 'MANUAL' ? <DoorOpen className="size-4" /> : <UserRound className="size-4" />}
        </span>
      )}
      {showResult && (
        <span
          className={clsx('absolute -end-1 -bottom-1 size-3 rounded-full ring-2 ring-card', log.result === 'GRANTED' ? 'bg-[#0ca30c]' : 'bg-[#d03b3b]')}
          aria-hidden
        />
      )}
    </span>
  );
}
