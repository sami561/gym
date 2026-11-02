import { INestApplication, INestMicroservice, Logger, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { loadEnv } from '../config/env';
import { serverTransport } from '../bus/transport';
import { AllRpcExceptionsFilter } from '../errors/rpc-exceptions.filter';
import { HealthResult } from '../contracts/common.contracts';

/** Starts a bus-only microservice (no HTTP port). */
export async function bootstrapService(module: Type<unknown>, service: string): Promise<INestMicroservice> {
  loadEnv();
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(module, serverTransport(service));
  app.useGlobalFilters(new AllRpcExceptionsFilter());
  app.enableShutdownHooks();
  await app.listen();
  new Logger('Bootstrap').log(`${service} listening on the ${process.env.BUS_TRANSPORT ?? 'redis'} bus`);
  return app;
}

/** Starts a microservice that also serves HTTP/WebSocket on `port` (e.g. access-service for door agents). */
export async function bootstrapHybridService(
  module: Type<unknown>,
  service: string,
  port: number,
): Promise<INestApplication> {
  loadEnv();
  const app = await NestFactory.create(module);
  app.connectMicroservice<MicroserviceOptions>(serverTransport(service), { inheritAppConfig: true });
  app.useGlobalFilters(new AllRpcExceptionsFilter());
  app.enableShutdownHooks();
  await app.startAllMicroservices();
  await app.listen(port);
  new Logger('Bootstrap').log(`${service} listening on the bus and on :${port}`);
  return app;
}

const startedAt = Date.now();

export function healthResult(service: string): HealthResult {
  return { service, status: 'ok', uptime: Math.round((Date.now() - startedAt) / 1000) };
}
