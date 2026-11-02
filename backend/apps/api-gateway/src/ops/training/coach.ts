import { BadRequestException } from '@nestjs/common';
import { AuthUser, Role } from '@app/common';

/** Explicit coach, or the current user when a coach is acting for themselves. */
export function resolveCoachId(user: AuthUser, coachId?: string): string {
  const resolved = coachId ?? (user.role === Role.COACH ? user.id : undefined);
  if (!resolved) throw new BadRequestException('Choisissez le coach.');
  return resolved;
}
