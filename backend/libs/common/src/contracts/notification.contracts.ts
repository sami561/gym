import { Recipient } from './common.contracts';

export interface RegisterPushRequest {
  userId: string;
  token: string;
}

export interface InactiveMembersRequest {
  days?: number;
}

export interface InactiveMember extends Recipient {
  lastVisitAt: string | null;
  daysSinceVisit: number | null;
}
