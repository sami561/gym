import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Not, Repository } from 'typeorm';
import {
  AssignLockerRequest,
  CreateLockersRequest,
  IdRequest,
  ListLockersRequest,
  LockerDto,
  LockerStatus,
  MemberDto,
  OkResult,
  PATTERNS,
  RpcClient,
  fullName,
  toDateOnly,
} from '@app/common';
import { toLockerDto } from '../mappers';
import { RoomsService } from '../rooms/rooms.service';
import { oneOf, optionalDateOnly, optionalText } from '../shared/inputs';
import { Locker } from './locker.entity';
import { compareLockerNumbers, lockerNumbers } from './locker-numbers';

const RELEASED = { status: LockerStatus.FREE, memberId: null, memberName: null, assignedUntil: null };

@Injectable()
export class LockersService {
  private readonly logger = new Logger(LockersService.name);

  constructor(
    @InjectRepository(Locker) private readonly lockers: Repository<Locker>,
    private readonly rooms: RoomsService,
    private readonly rpc: RpcClient,
  ) {}

  async list(request: ListLockersRequest): Promise<LockerDto[]> {
    const lockers = await this.lockers.find({
      where: {
        ...(request.roomId ? { roomId: request.roomId } : {}),
        ...(request.status ? { status: request.status } : {}),
      },
      relations: { room: true },
    });
    return lockers.sort((a, b) => compareLockerNumbers(a.number, b.number)).map(toLockerDto);
  }

  /** Creates the missing lockers of the range (existing numbers are skipped) and returns the new ones. */
  async create(request: CreateLockersRequest): Promise<LockerDto[]> {
    const numbers = lockerNumbers(request.prefix, request.from, request.to);
    const room = request.roomId ? await this.rooms.findOrFail(request.roomId) : null;
    const existing = new Set(
      (await this.lockers.find({ where: { number: In(numbers) }, select: { number: true } })).map((l) => l.number),
    );
    const created = await this.lockers.save(
      numbers
        .filter((number) => !existing.has(number))
        .map((number) => this.lockers.create({ number, roomId: room?.id ?? null, status: LockerStatus.FREE })),
    );
    return created.map((locker) => toLockerDto({ ...locker, room }));
  }

  /** memberId set → rent the locker to that member; memberId null → release it (or mark it out of order). */
  async assign(request: AssignLockerRequest): Promise<LockerDto> {
    const locker = await this.findOrFail(request.id);
    const status = request.status === undefined ? undefined : oneOf(request.status, LockerStatus, 'Statut');

    if (request.memberId) {
      if (status === LockerStatus.OUT_OF_ORDER || status === LockerStatus.FREE) {
        throw new BadRequestException('Un casier attribué est forcément occupé.');
      }
      if (locker.status === LockerStatus.OUT_OF_ORDER) throw new ConflictException('Casier hors service.');
      if (locker.memberId && locker.memberId !== request.memberId) {
        throw new ConflictException(`Casier déjà attribué à ${locker.memberName ?? 'un autre membre'}.`);
      }
      const other = await this.lockers.findOne({ where: { memberId: request.memberId, id: Not(locker.id) } });
      if (other) throw new ConflictException(`Ce membre a déjà le casier ${other.number}.`);

      const sameMember = locker.memberId === request.memberId;
      locker.memberName =
        optionalText(request.memberName) ??
        (sameMember ? locker.memberName : null) ??
        (await this.memberName(request.memberId));
      locker.memberId = request.memberId;
      locker.assignedUntil =
        request.assignedUntil === undefined
          ? sameMember
            ? locker.assignedUntil
            : null
          : (optionalDateOnly(request.assignedUntil, "Date de fin d'attribution") ?? null);
      locker.status = LockerStatus.OCCUPIED;
    } else {
      Object.assign(locker, RELEASED);
      if (status === LockerStatus.OUT_OF_ORDER) locker.status = LockerStatus.OUT_OF_ORDER;
    }
    return toLockerDto(await this.lockers.save(locker));
  }

  async remove(request: IdRequest): Promise<OkResult> {
    const locker = await this.findOrFail(request.id);
    if (locker.memberId) throw new ConflictException(`Casier attribué à ${locker.memberName ?? 'un membre'} : libérez-le d'abord.`);
    await this.lockers.delete(locker.id);
    return { ok: true };
  }

  async releaseMember(memberId: string): Promise<number> {
    const result = await this.lockers.update({ memberId }, RELEASED);
    return result.affected ?? 0;
  }

  async renameMember(memberId: string, name: string): Promise<void> {
    await this.lockers.update({ memberId }, { memberName: name });
  }

  /** Rentals end after their last day. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async releaseExpired(): Promise<void> {
    const result = await this.lockers.update(
      { memberId: Not(IsNull()), assignedUntil: LessThan(toDateOnly()) },
      RELEASED,
    );
    if (result.affected) this.logger.log(`${result.affected} casier(s) libéré(s) (attribution échue)`);
  }

  private async findOrFail(id: string): Promise<Locker> {
    const locker = id ? await this.lockers.findOne({ where: { id }, relations: { room: true } }) : null;
    if (!locker) throw new NotFoundException('Casier introuvable.');
    return locker;
  }

  /** Display name from membership-service; the locker still works without it. */
  private async memberName(memberId: string): Promise<string | null> {
    try {
      return fullName(await this.rpc.send<MemberDto, IdRequest>(PATTERNS.members.get, { id: memberId }, 3000));
    } catch {
      return null;
    }
  }
}
