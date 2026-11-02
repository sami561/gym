import { ClientOptions, MicroserviceOptions, Transport } from '@nestjs/microservices';
import { env, envInt } from '../config/env';

/**
 * BUS_TRANSPORT=redis (default, local dev) or nats (production: queue groups give
 * load balancing across replicas and one delivery per service for events).
 */
function transportKind(): 'redis' | 'nats' {
  return env('BUS_TRANSPORT', 'redis') === 'nats' ? 'nats' : 'redis';
}

/**
 * Bus credentials: REDIS_PASSWORD (requirepass, or the password of the Redis 6+ ACL user
 * REDIS_USERNAME) and NATS_TOKEN (server started with --auth). Unset means no auth, as
 * with a local Homebrew Redis.
 */
function redisOptions() {
  return {
    host: env('REDIS_HOST', '127.0.0.1'),
    port: envInt('REDIS_PORT', 6379),
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    retryAttempts: 20,
    retryDelay: 1000,
  };
}

function natsOptions() {
  return {
    servers: env('NATS_URL', 'nats://127.0.0.1:4222').split(','),
    ...(process.env.NATS_TOKEN ? { token: process.env.NATS_TOKEN } : {}),
  };
}

/**
 * Options for a service listening on the bus. `service` names its NATS queue group;
 * `broadcast` (gateway live feed) skips the queue so every replica gets every event.
 */
export function serverTransport(service: string, opts: { broadcast?: boolean } = {}): MicroserviceOptions {
  if (transportKind() === 'nats') {
    return {
      transport: Transport.NATS,
      options: { ...natsOptions(), ...(opts.broadcast ? {} : { queue: service }) },
    };
  }
  return { transport: Transport.REDIS, options: redisOptions() };
}

/** Options for a client that sends RPCs / publishes events on the bus. */
export function clientTransport(): ClientOptions {
  if (transportKind() === 'nats') {
    return { transport: Transport.NATS, options: natsOptions() };
  }
  return { transport: Transport.REDIS, options: redisOptions() };
}
