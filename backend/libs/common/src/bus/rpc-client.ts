import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, firstValueFrom, throwError, timeout } from 'rxjs';
import { RpcError } from '../errors/rpc-error';
import { BUS_CLIENT } from './bus.constants';

@Injectable()
export class RpcClient implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RpcClient.name);

  constructor(@Inject(BUS_CLIENT) private readonly client: ClientProxy) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.client.connect();
    } catch (err) {
      this.logger.warn(`Bus not reachable yet, will retry on first call: ${(err as Error).message}`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client.close();
  }

  /** Request/response call to the service that owns `pattern`. Errors arrive as RpcError. */
  send<TResult, TInput = unknown>(pattern: string, data: TInput, timeoutMs = 10_000): Promise<TResult> {
    return firstValueFrom(
      this.client.send<TResult, TInput>(pattern, data ?? ({} as TInput)).pipe(
        timeout(timeoutMs),
        catchError((err) => throwError(() => RpcError.from(err, pattern))),
      ),
    );
  }
}
