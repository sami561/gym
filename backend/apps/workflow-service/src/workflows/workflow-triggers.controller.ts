import { Controller } from '@nestjs/common';
import { BaseRpcContext, Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { TRIGGERABLE_EVENTS } from '@app/common';
import { isPlainObject } from '../engine/templating';
import { WorkflowsService } from './workflows.service';

@Controller()
export class WorkflowTriggersController {
  constructor(private readonly workflows: WorkflowsService) {}

  /**
   * One subscription per TRIGGERABLE_EVENTS entry (new entries are picked up automatically).
   * The first context argument is the channel (Redis) / subject (NATS), i.e. the event name.
   */
  @EventPattern([...TRIGGERABLE_EVENTS])
  async onDomainEvent(@Payload() payload: unknown, @Ctx() context: BaseRpcContext): Promise<void> {
    const event = String(context.getArgByIndex(0));
    await this.workflows.triggerEvent(event, isPlainObject(payload) ? payload : {});
  }
}
