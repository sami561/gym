import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CoachPtSummary,
  CoachPtSummaryRequest,
  CreatePtSessionRequest,
  ListPtSessionsRequest,
  PATTERNS,
  PtSessionDto,
  UpdatePtSessionRequest,
} from '@app/common';
import { PtSessionsService } from './pt-sessions.service';

@Controller()
export class PtSessionsController {
  constructor(private readonly sessions: PtSessionsService) {}

  @MessagePattern(PATTERNS.ptSessions.list)
  list(@Payload() request: ListPtSessionsRequest): Promise<PtSessionDto[]> {
    return this.sessions.list(request ?? {});
  }

  @MessagePattern(PATTERNS.ptSessions.create)
  create(@Payload() request: CreatePtSessionRequest): Promise<PtSessionDto> {
    return this.sessions.create(request);
  }

  @MessagePattern(PATTERNS.ptSessions.update)
  update(@Payload() request: UpdatePtSessionRequest): Promise<PtSessionDto> {
    return this.sessions.update({ id: request.id, data: request.data ?? {} });
  }

  @MessagePattern(PATTERNS.ptSessions.coachSummary)
  coachSummary(@Payload() request: CoachPtSummaryRequest): Promise<CoachPtSummary> {
    return this.sessions.coachSummary(request);
  }
}
