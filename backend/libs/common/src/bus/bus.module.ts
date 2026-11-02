import { DynamicModule, Global, Module } from '@nestjs/common';
import { ClientProxyFactory } from '@nestjs/microservices';
import { clientTransport } from './transport';
import { RpcClient } from './rpc-client';
import { EventBus } from './event-bus';
import { BUS_CLIENT } from './bus.constants';

/**
 * One bus connection per process, used both to call other services (RpcClient.send)
 * and to publish domain events (EventBus.publish).
 */
@Global()
@Module({})
export class BusModule {
  static forRoot(): DynamicModule {
    return {
      module: BusModule,
      global: true,
      providers: [
        { provide: BUS_CLIENT, useFactory: () => ClientProxyFactory.create(clientTransport()) },
        RpcClient,
        EventBus,
      ],
      exports: [BUS_CLIENT, RpcClient, EventBus],
    };
  }
}
