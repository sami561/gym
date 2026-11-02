import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CommandQueue, sleep, withTimeout } from '../src/command-queue';

test('runs commands one at a time, in submission order', async () => {
  const queue = new CommandQueue();
  const log: string[] = [];
  let running = 0;
  let maxRunning = 0;
  const command = (name: string, ms: number) => async () => {
    maxRunning = Math.max(maxRunning, ++running);
    log.push(`start ${name}`);
    await sleep(ms);
    log.push(`end ${name}`);
    running--;
    return name;
  };

  const results = await Promise.all([
    queue.run(command('unlock', 30)),
    queue.run(command('write user', 5)),
    queue.run(command('keep-alive', 1)),
  ]);
  assert.deepEqual(results, ['unlock', 'write user', 'keep-alive']);
  assert.equal(maxRunning, 1);
  assert.deepEqual(log, ['start unlock', 'end unlock', 'start write user', 'end write user', 'start keep-alive', 'end keep-alive']);
});

test('a failed command does not block the next ones', async () => {
  const queue = new CommandQueue();
  const failed = queue.run(async () => {
    throw new Error('terminal busy');
  });
  const next = queue.run(async () => 'ok');
  await assert.rejects(failed, { message: 'terminal busy' });
  assert.equal(await next, 'ok');
});

test('a command that throws synchronously only fails itself', async () => {
  const queue = new CommandQueue();
  const broken = (() => {
    throw new Error('bad payload');
  }) as () => Promise<never>;
  await assert.rejects(queue.run(broken), { message: 'bad payload' });
  assert.equal(await queue.run(async () => 1), 1);
});

test('a command that hangs times out with its label and frees the queue', async () => {
  const queue = new CommandQueue();
  const hung = queue.run(() => new Promise<never>(() => undefined), 30, 'unlock');
  const next = queue.run(async () => 'next');
  await assert.rejects(hung, { message: 'unlock timed out after 30 ms' });
  assert.equal(await next, 'next');
});

test('size counts waiting and running commands', async () => {
  const queue = new CommandQueue();
  assert.equal(queue.size, 0);
  const all = [queue.run(() => sleep(5)), queue.run(() => sleep(5)), queue.run(() => sleep(5))];
  assert.equal(queue.size, 3);
  await Promise.all(all);
  assert.equal(queue.size, 0);
});

test('withTimeout passes results and errors through and only stops slow work', async () => {
  assert.equal(await withTimeout(Promise.resolve(5), 50), 5);
  await assert.rejects(withTimeout(Promise.reject(new Error('refused')), 50), { message: 'refused' });
  await assert.rejects(withTimeout(sleep(100), 10, 'relay request'), { message: 'relay request timed out after 10 ms' });
  assert.equal(await withTimeout(sleep(20).then(() => 'no limit')), 'no limit');
});
