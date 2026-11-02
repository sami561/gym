/*
 * Dev tool: call a microservice directly on the bus, without the gateway.
 *   npm run rpc -- <pattern> '<json payload>'          request/response
 *   npm run rpc -- <event> '<json payload>' --emit     publish an event
 * Example: npm run rpc -- plans.list '{}'
 */
const { ClientProxyFactory, Transport } = require('@nestjs/microservices');
const { firstValueFrom, lastValueFrom, timeout } = require('rxjs');

/**
 * Same bus and credentials as clientTransport() in libs/common/src/bus/transport.ts: REDIS_USERNAME /
 * REDIS_PASSWORD and NATS_TOKEN (unset = no auth), so a password-protected bus answers too.
 */
function busOptions(env = process.env) {
  if (env.BUS_TRANSPORT === 'nats') {
    const servers = (env.NATS_URL || 'nats://127.0.0.1:4222').split(',');
    return { transport: Transport.NATS, options: { servers, ...(env.NATS_TOKEN ? { token: env.NATS_TOKEN } : {}) } };
  }
  return {
    transport: Transport.REDIS,
    options: {
      host: env.REDIS_HOST || '127.0.0.1',
      port: Number(env.REDIS_PORT || 6379),
      username: env.REDIS_USERNAME || undefined,
      password: env.REDIS_PASSWORD || undefined,
    },
  };
}

function main() {
  require('dotenv').config();
  const [pattern, json = '{}', mode] = process.argv.slice(2);
  if (!pattern) {
    console.error("usage: npm run rpc -- <pattern> '<json>' [--emit]");
    process.exit(1);
  }

  const client = ClientProxyFactory.create(busOptions());

  (async () => {
    await client.connect();
    const payload = JSON.parse(json);
    if (mode === '--emit') {
      await lastValueFrom(client.emit(pattern, payload), { defaultValue: undefined });
      console.log(`emitted ${pattern}`);
    } else {
      const result = await firstValueFrom(client.send(pattern, payload).pipe(timeout(10000)));
      console.log(JSON.stringify(result, null, 2));
    }
    await client.close();
  })().catch(async (err) => {
    console.error('RPC error:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
    await client.close();
    process.exit(1);
  });
}

// Run by `npm run rpc`; the bus transport spec loads it only to compare busOptions().
if (require.main === module) main();

module.exports = { busOptions };
