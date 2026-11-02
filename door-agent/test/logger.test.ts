import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger, errorMessage, type LogFormat, type LogLevel } from '../src/logger';

function collect(level: LogLevel, format: LogFormat, bindings: Record<string, unknown> = {}) {
  const lines: string[] = [];
  return { lines, logger: createLogger({ level, format }, bindings, (line) => lines.push(line)) };
}

test('messages below the configured level are dropped', () => {
  const { lines, logger } = collect('warn', 'json');
  logger.debug('d');
  logger.info('i');
  logger.warn('w');
  logger.error('e');
  assert.deepEqual(
    lines.map((line) => JSON.parse(line).level),
    ['warn', 'error'],
  );
});

test('JSON lines carry the time, level, message, bindings and fields', () => {
  const { lines, logger } = collect('debug', 'json', { service: 'door-agent' });
  logger.child({ component: 'zkteco', doorId: 'd1' }).info('door unlocked', { seconds: 5, skipped: undefined });
  const { time, ...entry } = JSON.parse(lines[0]);
  assert.match(time, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.deepEqual(entry, { level: 'info', msg: 'door unlocked', service: 'door-agent', component: 'zkteco', doorId: 'd1', seconds: 5 });
});

test('errors are logged with their message and stack', () => {
  const { lines, logger } = collect('debug', 'json');
  logger.error('fatal', { error: new Error('socket hang up') });
  const { error } = JSON.parse(lines[0]);
  assert.equal(error.message, 'socket hang up');
  assert.match(error.stack, /^Error: socket hang up\n/);
});

test('child loggers add bindings without changing their parent', () => {
  const { lines, logger } = collect('debug', 'json', { service: 'door-agent' });
  logger.child({ component: 'scan' }).info('a', { component: 'override' });
  logger.info('b');
  assert.equal(JSON.parse(lines[0]).component, 'override');
  assert.equal(JSON.parse(lines[1]).component, undefined);
});

test('pretty lines read as time, padded level, [component], message and fields', () => {
  const { lines, logger } = collect('debug', 'pretty', { component: 'socket' });
  logger.warn('cannot reach access-service', { error: 'timeout', attempt: 3, doors: ['a'] });
  logger.info('plain');
  assert.match(lines[0], /^\d{2}:\d{2}:\d{2} WARN  \[socket\] cannot reach access-service error=timeout attempt=3 doors=\["a"\]$/);
  assert.match(lines[1], /^\d{2}:\d{2}:\d{2} INFO  \[socket\] plain$/);
});

test('errorMessage reads Errors, zkteco-js error objects and plain values', () => {
  assert.equal(errorMessage(new Error('refused')), 'refused');
  assert.equal(errorMessage(new TypeError('')), 'TypeError');
  // zkteco-js throws { err, ip, command }, sometimes wrapped twice with the same command
  const connect = {
    err: { err: new Error('connect ECONNREFUSED 10.0.0.5:4370'), ip: '10.0.0.5', command: 'TCP CONNECT' },
    ip: '10.0.0.5',
    command: 'TCP CONNECT',
  };
  assert.equal(errorMessage(connect), 'TCP CONNECT: connect ECONNREFUSED 10.0.0.5:4370');
  assert.equal(errorMessage({ err: { message: 'TIMEOUT_ON_WRITING_MESSAGE' }, command: '[TCP] unlock' }), '[TCP] unlock: TIMEOUT_ON_WRITING_MESSAGE');
  assert.equal(errorMessage({ code: 'ECONNRESET' }), 'ECONNRESET');
  assert.equal(errorMessage('plain text'), 'plain text');
  assert.equal(errorMessage(42), '42');
  assert.equal(errorMessage(undefined), 'undefined');
  assert.equal(errorMessage({ status: 503 }), '{"status":503}');
});

test('errorMessage never throws, even for a circular error object', () => {
  const looped: Record<string, unknown> = { reason: 'loop' };
  looped.err = looped;
  assert.equal(typeof errorMessage(looped), 'string');
  assert.match(errorMessage(looped), /reason: 'loop'/);

  // zkteco-js-like wrappers pointing at each other: the depth limit, then the circular fallback
  const a: Record<string, unknown> = { command: 'A' };
  const b: Record<string, unknown> = { command: 'B', err: a };
  a.err = b;
  assert.equal(typeof errorMessage(a), 'string');

  assert.equal(errorMessage({ attempts: 10n }), '{ attempts: 10n }');
  assert.equal(errorMessage(Symbol('lost')), 'Symbol(lost)');
  const hostile = {
    get message(): string {
      throw new Error('getter');
    },
  };
  assert.equal(errorMessage(hostile), 'unknown error');
  const odd = new Error('');
  Object.defineProperty(odd, 'name', { value: { toString: () => 'OddError' } });
  assert.equal(errorMessage(odd), 'OddError');
});
