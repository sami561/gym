import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IdRequest, MemberDto, PATTERNS, Role, RpcClient, RpcError, UserDto, fullName } from '@app/common';

/**
 * Resolves the names stored (denormalised) on programs and PT sessions.
 * Unknown ids are rejected; if the owning service is down we fall back to a placeholder
 * that member.updated / user.updated will correct later.
 */
@Injectable()
export class PeopleService {
  private readonly logger = new Logger(PeopleService.name);

  constructor(private readonly rpc: RpcClient) {}

  async memberName(memberId: string): Promise<string> {
    try {
      const member = await this.rpc.send<MemberDto, IdRequest>(PATTERNS.members.get, { id: memberId }, 5_000);
      return fullName(member);
    } catch (err) {
      const error = RpcError.from(err);
      if (error.statusCode === 404 || error.statusCode === 400) throw new NotFoundException('Membre introuvable.');
      this.logger.warn(`members.get unavailable (${error.message}), using a placeholder name`);
      return 'Membre';
    }
  }

  async coachName(coachId: string): Promise<string> {
    let user: UserDto;
    try {
      user = await this.rpc.send<UserDto, IdRequest>(PATTERNS.users.get, { id: coachId }, 5_000);
    } catch (err) {
      const error = RpcError.from(err);
      if (error.statusCode === 404 || error.statusCode === 400) throw new NotFoundException('Coach introuvable.');
      this.logger.warn(`users.get unavailable (${error.message}), using a placeholder name`);
      return 'Coach';
    }
    if (user.role === Role.MEMBER) throw new BadRequestException("Ce compte n'est pas un coach.");
    return fullName(user);
  }
}
