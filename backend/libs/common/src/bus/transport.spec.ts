import { execFileSync } from 'child_process';
import * as path from 'path';
import { ClientOptions, Transport } from '@nestjs/microservices';
import { clientTransport } from './transport';

// Never read the developer's backend/.env in a unit test.
jest.mock('dotenv', () => ({ config: jest.fn() }));

const BACKEND = path.resolve(__dirname, '../../../..');
const BUS_ENV = ['BUS_TRANSPORT', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_USERNAME', 'REDIS_PASSWORD', 'NATS_URL', 'NATS_TOKEN'];
const REDIS_AUTH = { REDIS_HOST: 'redis', REDIS_PORT: '6380', REDIS_USERNAME: 'meliora', REDIS_PASSWORD: 'redis-pass' };
const NATS_AUTH = { BUS_TRANSPORT: 'nats', NATS_URL: 'nats://nats-1:4222,nats://nats-2:4222', NATS_TOKEN: 'nats-token' };
const CASES: [string, Record<string, string>][] = [
  ['local Redis without auth', {}],
  ['Redis with an ACL user', REDIS_AUTH],
  ['Redis with requirepass only', { REDIS_PASSWORD: 'redis-pass', REDIS_USERNAME: '' }],
  ['NATS with a token', NATS_AUTH],
  ['NATS without auth', { BUS_TRANSPORT: 'nats' }],
];

/**
 * busOptions() of backend/scripts/rpc.js (`npm run rpc`) for each env, loaded by plain Node like the
 * CLI (ts-jest does not compile JavaScript) and without running it. The JSON is the last line printed.
 */
function rpcBusOptions(envs: Record<string, string>[]): ClientOptions[] {
  const script =
    "const { busOptions } = require('./scripts/rpc.js');" +
    'console.log(JSON.stringify(JSON.parse(process.argv[1]).map((env) => busOptions(env))));';
  const out = execFileSync(process.execPath, ['-e', script, JSON.stringify(envs)], {
    cwd: BACKEND,
    encoding: 'utf8',
    env: {},
    timeout: 15_000,
  });
  return JSON.parse(out.trim().split('\n').pop() ?? '[]') as ClientOptions[];
}

describe('bus transport — npm run rpc (scripts/rpc.js)', () => {
  const savedEnv = process.env;
  let rpc: ClientOptions[] = [];

  beforeAll(() => {
    rpc = rpcBusOptions(CASES.map(([, vars]) => vars));
  });

  beforeEach(() => {
    process.env = { ...savedEnv };
    BUS_ENV.forEach((name) => delete process.env[name]);
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it('sends the Redis user and password, and the NATS token', () => {
    expect(rpc[1]).toEqual({
      transport: Transport.REDIS,
      options: { host: 'redis', port: 6380, username: 'meliora', password: 'redis-pass' },
    });
    expect(rpc[2]).toEqual({ transport: Transport.REDIS, options: { host: '127.0.0.1', port: 6379, password: 'redis-pass' } });
    expect(rpc[3]).toEqual({
      transport: Transport.NATS,
      options: { servers: ['nats://nats-1:4222', 'nats://nats-2:4222'], token: 'nats-token' },
    });
    expect(rpc[4]).toEqual({ transport: Transport.NATS, options: { servers: ['nats://127.0.0.1:4222'] } });
  });

  it.each(CASES.map(([label, vars], index) => [label, vars, index] as const))(
    'connects like the services (clientTransport) — %s',
    (_label, vars, index) => {
      Object.assign(process.env, vars);
      const services = clientTransport();
      // The services retry a lost Redis connection; the one-shot CLI fails at once instead.
      const { retryAttempts: _attempts, retryDelay: _delay, ...connection } = services.options as Record<string, unknown>;
      expect(rpc[index]).toEqual({ transport: services.transport, options: connection });
    },
  );
});
