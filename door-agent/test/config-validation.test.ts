import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { ConfigError, parseConfig } from '../src/config';

const required = { SERVER_URL: 'https://api.meliora-gym.tn', AGENT_KEY: 'k'.repeat(32) };

function problemsOf(env: Record<string, string>): string[] {
  try {
    parseConfig({ ...required, ...env });
    return [];
  } catch (err) {
    if (err instanceof ConfigError) return err.problems;
    throw err;
  }
}

test('integer settings accept their bounds and reject values just outside', () => {
  const bounds: [name: string, min: number, max: number][] = [
    ['SYNC_INTERVAL_SECONDS', 30, 86_400],
    ['HEARTBEAT_SECONDS', 5, 3600],
    ['ZK_TIMEOUT_MS', 500, 60_000],
    ['ZK_UDP_INPORT', 1, 65_535],
    ['ZK_KEEPALIVE_SECONDS', 10, 3600],
    ['EVENT_BUFFER_MAX', 10, 1_000_000],
    ['LOCAL_SCAN_PORT', 0, 65_535],
  ];
  for (const [name, min, max] of bounds) {
    assert.deepEqual(problemsOf({ [name]: String(min) }), [], `${name}=${min}`);
    assert.deepEqual(problemsOf({ [name]: String(max) }), [], `${name}=${max}`);
    assert.deepEqual(
      problemsOf({ [name]: String(min - 1) }),
      [`${name} must be an integer between ${min} and ${max} (got "${min - 1}")`],
    );
    assert.equal(problemsOf({ [name]: String(max + 1) }).length, 1, `${name}=${max + 1}`);
  }
});

test('integer settings must be whole numbers; blank values fall back to the default', () => {
  assert.equal(problemsOf({ HEARTBEAT_SECONDS: '7.5' }).length, 1);
  assert.equal(problemsOf({ HEARTBEAT_SECONDS: 'ten' }).length, 1);
  const config = parseConfig({ ...required, HEARTBEAT_SECONDS: '   ', EVENT_BUFFER_MAX: '' });
  assert.equal(config.heartbeatIntervalMs, 30_000);
  assert.equal(config.eventBufferMax, 5000);
});

test('durations given in seconds become milliseconds', () => {
  const config = parseConfig({
    ...required,
    SYNC_INTERVAL_SECONDS: '45',
    HEARTBEAT_SECONDS: '10',
    ZK_KEEPALIVE_SECONDS: '20',
    ZK_TIMEOUT_MS: '2500',
  });
  assert.equal(config.syncIntervalMs, 45_000);
  assert.equal(config.heartbeatIntervalMs, 10_000);
  assert.equal(config.zk.keepAliveMs, 20_000);
  assert.equal(config.zk.timeoutMs, 2500);
});

test('boolean settings accept the usual spellings in any case', () => {
  for (const raw of ['1', 'true', 'YES', 'On']) assert.equal(parseConfig({ ...required, SCAN_STDIN: raw }).scanStdin, true, raw);
  for (const raw of ['0', 'False', 'no', 'OFF']) assert.equal(parseConfig({ ...required, SCAN_STDIN: raw }).scanStdin, false, raw);
  assert.deepEqual(problemsOf({ SCAN_STDIN: 'maybe' }), ['SCAN_STDIN must be true or false (got "maybe")']);
});

test('SERVER_URL is trimmed, loses its trailing slashes and keeps a path prefix', () => {
  assert.equal(parseConfig({ ...required, SERVER_URL: '  http://192.168.1.10:4000//  ' }).serverUrl, 'http://192.168.1.10:4000');
  assert.equal(parseConfig({ ...required, SERVER_URL: 'https://gym.example.tn/api/' }).serverUrl, 'https://gym.example.tn/api');
});

test('SERVER_URL must be an absolute http(s) URL', () => {
  for (const url of ['ws://192.168.1.10:4000', 'ftp://gym.tn', 'localhost:4000', 'api.meliora-gym.tn', '//api.gym.tn']) {
    assert.deepEqual(problemsOf({ SERVER_URL: url }), [`SERVER_URL must be an http(s) URL (got "${url}")`]);
  }
});

test('AGENT_KEY must look complete', () => {
  assert.deepEqual(problemsOf({ AGENT_KEY: 'x'.repeat(16) }), []);
  assert.deepEqual(problemsOf({ AGENT_KEY: 'x'.repeat(15) }), ['AGENT_KEY looks truncated (expected at least 16 characters)']);
  assert.equal(parseConfig({ ...required, AGENT_KEY: `  ${'x'.repeat(20)}\n` }).agentKey, 'x'.repeat(20));
});

test('LOG_FORMAT auto follows the terminal, explicit formats win', () => {
  assert.equal(parseConfig(required, { isTTY: true }).logFormat, 'pretty');
  assert.equal(parseConfig(required, { isTTY: false }).logFormat, 'json');
  assert.equal(parseConfig({ ...required, LOG_FORMAT: 'JSON' }, { isTTY: true }).logFormat, 'json');
  assert.equal(parseConfig({ ...required, LOG_FORMAT: 'pretty' }).logFormat, 'pretty');
  assert.deepEqual(problemsOf({ LOG_FORMAT: 'xml' }), ['LOG_FORMAT must be one of auto, json, pretty (got "xml")']);
  assert.deepEqual(problemsOf({ LOG_LEVEL: 'verbose' }), ['LOG_LEVEL must be one of debug, info, warn, error (got "verbose")']);
});

test('local scan endpoint: port 0 turns it off, host and token are optional', () => {
  assert.equal(parseConfig({ ...required, LOCAL_SCAN_PORT: '0' }).localScan.port, null);
  assert.deepEqual(parseConfig({ ...required, LOCAL_SCAN_PORT: '8787', LOCAL_SCAN_HOST: '127.0.0.1' }).localScan, {
    port: 8787,
    host: '127.0.0.1',
    token: null,
  });
});

test('.env.example is a valid configuration once AGENT_KEY is filled in', () => {
  const example = dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env.example')));
  assert.doesNotThrow(() => parseConfig({ ...example, AGENT_KEY: 'k'.repeat(32) }));
});
