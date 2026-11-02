import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LockerDto, MemberDto, PATTERNS, Role, Roles, RpcClient, fullName } from '@app/common';
import { AssignLockerDto, CreateLockersDto, ListLockersQuery } from './facility.dto';

const MAX_LOCKERS_PER_BATCH = 500;

@ApiTags('Casiers')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('lockers')
export class LockersController {
  constructor(private readonly rpc: RpcClient) {}

  @Get()
  list(@Query() q: ListLockersQuery) {
    return this.rpc.send<LockerDto[]>(PATTERNS.lockers.list, q);
  }

  /** Creates the numbered lockers prefix+from … prefix+to (existing numbers are skipped). */
  @Post()
  create(@Body() dto: CreateLockersDto) {
    if (dto.from > dto.to) throw new BadRequestException('Le premier numéro doit précéder le dernier.');
    if (dto.to - dto.from + 1 > MAX_LOCKERS_PER_BATCH) {
      throw new BadRequestException(`${MAX_LOCKERS_PER_BATCH} casiers maximum par création.`);
    }
    return this.rpc.send<LockerDto[]>(PATTERNS.lockers.create, dto);
  }

  /** Assigns a locker to a member (name looked up when omitted), or frees it with memberId null. */
  @Patch(':id')
  async assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignLockerDto) {
    const memberId = dto.memberId ?? null;
    let memberName = dto.memberName ?? null;
    if (memberId && !memberName) {
      memberName = fullName(await this.rpc.send<MemberDto>(PATTERNS.members.get, { id: memberId }));
    }
    return this.rpc.send<LockerDto>(PATTERNS.lockers.assign, {
      id,
      memberId,
      memberName,
      assignedUntil: dto.assignedUntil ?? null,
      status: dto.status,
    });
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<{ ok: true }>(PATTERNS.lockers.remove, { id });
  }
}
