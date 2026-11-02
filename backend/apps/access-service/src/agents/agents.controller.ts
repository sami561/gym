import { Controller, UseFilters } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AgentDto, AllRpcExceptionsFilter, CreateAgentResult, IdRequest, OkResult, PATTERNS } from '@app/common';
import { AgentsService } from './agents.service';

@UseFilters(AllRpcExceptionsFilter)
@Controller()
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @MessagePattern(PATTERNS.agents.list)
  list(): Promise<AgentDto[]> {
    return this.agents.list();
  }

  @MessagePattern(PATTERNS.agents.create)
  create(@Payload() request: { name: string }): Promise<CreateAgentResult> {
    return this.agents.create(request);
  }

  @MessagePattern(PATTERNS.agents.remove)
  remove(@Payload() request: IdRequest): Promise<OkResult> {
    return this.agents.remove(request);
  }
}
