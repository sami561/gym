import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { InactiveMember, InactiveMembersRequest, PATTERNS } from '@app/common';
import { AutomationService } from './automation.service';

@Controller()
export class AutomationController {
  constructor(private readonly automation: AutomationService) {}

  @MessagePattern(PATTERNS.notifications.inactiveMembers)
  inactive(@Payload() request: InactiveMembersRequest): Promise<InactiveMember[]> {
    return this.automation.inactiveMembers(request ?? {});
  }
}
