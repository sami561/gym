import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusModule, databaseModule } from '@app/common';
import { AccessController } from './access/access.controller';
import { AccessService } from './access/access.service';
import { DoorOpener } from './access/door-opener.service';
import { AgentRegistry } from './agents/agent-registry.service';
import { AgentsController } from './agents/agents.controller';
import { AgentsGateway } from './agents/agents.gateway';
import { AgentsService } from './agents/agents.service';
import { DoorAgent } from './agents/door-agent.entity';
import { Door } from './doors/door.entity';
import { DoorsController } from './doors/doors.controller';
import { DoorsService } from './doors/doors.service';
import { AccessLog } from './logs/access-log.entity';
import { AccessLogsService } from './logs/access-logs.service';
import { AccessStatsService } from './logs/access-stats.service';
import { AccessMember } from './members/access-member.entity';
import { AccessMembersController } from './members/access-members.controller';
import { AccessMembersService } from './members/access-members.service';

/**
 * access-service: door access control. Owns doors, door agents, access logs and the
 * member credentials (QR secret, RFID badge, terminal user id); keeps a read-model of
 * member entitlements so doors keep working when membership-service is down.
 */
@Module({
  imports: [
    databaseModule('access'),
    TypeOrmModule.forFeature([AccessMember, Door, DoorAgent, AccessLog]),
    BusModule.forRoot(),
    ScheduleModule.forRoot(),
  ],
  controllers: [AccessController, AccessMembersController, DoorsController, AgentsController],
  providers: [
    AccessMembersService,
    AccessLogsService,
    AccessStatsService,
    DoorsService,
    AgentsService,
    AgentRegistry,
    DoorOpener,
    AccessService,
    AgentsGateway,
  ],
})
export class AppModule {}
