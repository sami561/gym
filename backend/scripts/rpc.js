/*
 * Dev tool: call a microservice directly on the bus, without the gateway.
 *   npm run rpc -- <pattern> '<json payload>'          request/response
 *   npm run rpc -- <event> '<json payload>' --emit     publish an event
 * Example: npm run rpc -- plans.list '{}'
 */
require('dotenv').config();
const { ClientProxyFactory, Transport } = require('@nestjs/microservices');
const { firstValueFrom, lastValueFrom, timeout } = require('rxjs');

const [pattern, json = '{}', mode] = process.argv.slice(2);
if (!pattern) {
  console.error("usage: npm run rpc -- <pattern> '<json>' [--emit]");
  process.exit(1);
}

const client = ClientProxyFactory.create(
  process.env.BUS_TRANSPORT === 'nats'
    ? { transport: Transport.NATS, options: { servers: (process.env.NATS_URL || 'nats://127.0.0.1:4222').split(',') } }
    : { transport: Transport.REDIS, options: { host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT || 6379) } },
);

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
