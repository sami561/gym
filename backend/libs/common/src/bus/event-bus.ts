import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { BUS_CLIENT } from './bus.constants';
import { EventPayloads } from './events';

@Injectable()
export class EventBus {
  private readonly logger = new Logger(EventBus.name);

  constructor(@Inject(BUS_CLIENT) private readonly client: ClientProxy) {}

  /** Fire-and-forget domain event, delivered to every service subscribed to it. */
  publish<K extends keyof EventPayloads>(event: K, data: EventPayloads[K]): void {
    this.client.emit<void, EventPayloads[K]>(event, data).subscribe({
      error: (err: Error) => this.logger.warn(`Could not publish ${event}: ${err.message}`),
    });
  }
}
