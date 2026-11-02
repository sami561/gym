import { ClientOptions, MicroserviceOptions, Transport } from '@nestjs/microservices';
import { env, envInt } from '../config/env';

/**
 * BUS_TRANSPORT=redis (default, local dev) or nats (production: queue groups give
 * load balancing across replicas and one delivery per service for events).
 */
function transportKind(): 'redis' | 'nats' {
  return env('BUS_TRANSPORT', 'redis') === 'nats' ? 'nats' : 'redis';
}

function redisOptions() {
  return {
    host: env('REDIS_HOST', '127.0.0.1'),
    port: envInt('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    retryAttempts: 20,
    retryDelay: 1000,
  };
}

/** Options for a service listening on the bus. `service` names its NATS queue group. */
export function serverTransport(service: string): MicroserviceOptions {
  if (transportKind() === 'nats') {
    return {
      transport: Transport.NATS,
      options: { servers: env('NATS_URL', 'nats://127.0.0.1:4222').split(','), queue: service },
    };
  }
  return { transport: Transport.REDIS, options: redisOptions() };
}

/** Options for a client that sends RPCs / publishes events on the bus. */
export function clientTransport(): ClientOptions {
  if (transportKind() === 'nats') {
    return {
      transport: Transport.NATS,
      options: { servers: env('NATS_URL', 'nats://127.0.0.1:4222').split(',') },
    };
  }
  return { transport: Transport.REDIS, options: redisOptions() };
}
