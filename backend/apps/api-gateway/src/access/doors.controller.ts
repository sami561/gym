import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AccessDecision,
  AgentDto,
  AuthUser,
  CreateAgentResult,
  CurrentUser,
  DoorDto,
  ListDoorsRequest,
  PATTERNS,
  Role,
  Roles,
  RpcClient,
  toActor,
} from '@app/common';
import { CreateAgentDto, CreateDoorDto, ManualOpenDto, UpdateDoorDto } from './access.dto';

@ApiTags('Portes & contrôleurs')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller()
export class DoorsController {
  constructor(private readonly rpc: RpcClient) {}

  /** Staff get the doors without their config; ADMIN gets it with every secret masked. */
  @Roles(Role.ADMIN, Role.STAFF)
  @Get('doors')
  list(@CurrentUser() user: AuthUser) {
    return this.rpc.send<DoorDto[], ListDoorsRequest>(PATTERNS.doors.list, { includeConfig: user.role === Role.ADMIN });
  }

  @Post('doors')
  create(@Body() dto: CreateDoorDto) {
    return this.rpc.send<DoorDto>(PATTERNS.doors.create, dto);
  }

  @Patch('doors/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDoorDto) {
    return this.rpc.send<DoorDto>(PATTERNS.doors.update, { id, data: dto });
  }

  @Delete('doors/:id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<{ ok: true }>(PATTERNS.doors.remove, { id });
  }

  /** Manual opening from the back-office, logged with the staff member's name. */
  @Roles(Role.ADMIN, Role.STAFF)
  @HttpCode(200)
  @Post('doors/:id/open')
  open(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ManualOpenDto) {
    return this.rpc.send<AccessDecision>(PATTERNS.doors.open, { doorId: id, actor: toActor(user), reason: dto.reason });
  }

  @Get('agents')
  agents() {
    return this.rpc.send<AgentDto[]>(PATTERNS.agents.list, {});
  }

  /** Returns the agent API key once — copy it into the door agent's .env. */
  @Post('agents')
  createAgent(@Body() dto: CreateAgentDto) {
    return this.rpc.send<CreateAgentResult>(PATTERNS.agents.create, { name: dto.name });
  }

  @Delete('agents/:id')
  removeAgent(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<{ ok: true }>(PATTERNS.agents.remove, { id });
  }
}
