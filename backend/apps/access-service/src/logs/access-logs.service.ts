import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import {
  AccessLogDto,
  AccessMethod,
  AccessResult,
  Actor,
  EventBus,
  EVENTS,
  fullName,
  ListLogsRequest,
} from '@app/common';
import { AccessMember } from '../members/access-member.entity';
import { Door } from '../doors/door.entity';
import { clampInt, isUuid } from '../shared/validation';
import { AccessLog } from './access-log.entity';

export interface RecordLogInput {
  member?: AccessMember | null;
  door?: Door | null;
  method: AccessMethod;
  result: AccessResult;
  reason?: string | null;
  actor?: Actor | null;
  /** Defaults to now; device punches keep the time recorded by the terminal. */
  createdAt?: Date;
  /** When set, a log with the same key is ignored (punch re-sent by an agent). */
  deviceEventKey?: string;
}

export function toAccessLogDto(log: AccessLog): AccessLogDto {
  return {
    id: log.id,
    memberId: log.memberId,
    memberName: log.memberName,
    memberCode: log.memberCode,
    doorId: log.doorId,
    doorName: log.doorName,
    method: log.method,
    result: log.result,
    reason: log.reason,
    openedById: log.openedById,
    openedByName: log.openedByName,
    createdAt: new Date(log.createdAt).toISOString(),
  };
}

@Injectable()
export class AccessLogsService {
  constructor(
    @InjectRepository(AccessLog) private readonly repo: Repository<AccessLog>,
    private readonly events: EventBus,
  ) {}

  /** Writes the log and publishes access.logged. Returns null when a device punch was a duplicate. */
  async record(input: RecordLogInput): Promise<AccessLogDto | null> {
    const log = this.repo.create({
      id: randomUUID(),
      memberId: input.member?.memberId ?? null,
      memberName: input.member ? fullName(input.member) : null,
      memberCode: input.member?.memberCode ?? null,
      doorId: input.door?.id ?? null,
      doorName: input.door?.name ?? null,
      method: input.method,
      result: input.result,
      reason: input.reason ? input.reason.slice(0, 300) : null,
      openedById: input.actor?.id ?? null,
      openedByName: input.actor?.name ?? null,
      deviceEventKey: input.deviceEventKey ?? null,
      createdAt: input.createdAt ?? new Date(),
    });

    if (input.deviceEventKey) {
      const inserted = await this.repo
        .createQueryBuilder()
        .insert()
        .into(AccessLog)
        .values(log)
        .orIgnore()
        .returning(['id'])
        .execute();
      if (!Array.isArray(inserted.raw) || inserted.raw.length === 0) return null;
    } else {
      await this.repo.insert(log);
    }

    const dto = toAccessLogDto(log);
    this.events.publish(EVENTS.accessLogged, dto);
    return dto;
  }

  async list(request: ListLogsRequest = {}): Promise<AccessLogDto[]> {
    const query = this.repo
      .createQueryBuilder('log')
      .orderBy('log.createdAt', 'DESC')
      .take(clampInt(request.limit, 1, 200, 50));
    if (request.doorId) {
      if (!isUuid(request.doorId)) return [];
      query.andWhere('log.doorId = :doorId', { doorId: request.doorId });
    }
    if (request.memberId) query.andWhere('log.memberId = :memberId', { memberId: request.memberId });
    if (request.result === AccessResult.GRANTED || request.result === AccessResult.DENIED) {
      query.andWhere('log.result = :result', { result: request.result });
    }
    if (request.before) {
      const before = new Date(request.before);
      if (!Number.isNaN(before.getTime())) query.andWhere('log.createdAt < :before', { before });
    }
    const logs = await query.getMany();
    return logs.map(toAccessLogDto);
  }
}
