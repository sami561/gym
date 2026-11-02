import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, parseConfig } from '../src/config';

const base = { SERVER_URL: 'https://api.meliora-gym.tn/', AGENT_KEY: 'a'.repeat(48) };

test('minimal configuration gets sensible defaults', () => {
  const config = parseConfig(base);
  assert.equal(config.serverUrl, 'https://api.meliora-gym.tn');
  assert.equal(config.defaultDoorId, null);
  assert.equal(config.localScan.port, null);
  assert.equal(config.scanStdin, true);
  assert.equal(config.syncIntervalMs, 300_000);
  assert.equal(config.heartbeatIntervalMs, 30_000);
  assert.equal(config.inactivePolicy, 'disable');
  assert.equal(config.zk.timeoutMs, 5000);
  assert.equal(config.logFormat, 'json');
});

test('reads the optional settings', () => {
  const config = parseConfig(
    {
      ...base,
      DEFAULT_DOOR_ID: 'door-main',
      LOCAL_SCAN_PORT: '8787',
      LOCAL_SCAN_TOKEN: 'tok',
      SCAN_STDIN: 'false',
      SYNC_INTERVAL_SECONDS: '120',
      INACTIVE_POLICY: 'delete',
      LOG_FORMAT: 'auto',
      LOG_LEVEL: 'DEBUG',
    },
    { isTTY: true },
  );
  assert.equal(config.defaultDoorId, 'door-main');
  assert.deepEqual(config.localScan, { port: 8787, host: '0.0.0.0', token: 'tok' });
  assert.equal(config.scanStdin, false);
  assert.equal(config.syncIntervalMs, 120_000);
  assert.equal(config.inactivePolicy, 'delete');
  assert.equal(config.logFormat, 'pretty');
  assert.equal(config.logLevel, 'debug');
});

test('reports every problem at once', () => {
  try {
    parseConfig({ SERVER_URL: 'ftp://x', AGENT_KEY: 'short', LOCAL_SCAN_PORT: '99999', INACTIVE_POLICY: 'ban' });
    assert.fail('expected a ConfigError');
  } catch (err) {
    assert.ok(err instanceof ConfigError);
    assert.equal(err.problems.length, 4);
    assert.match(err.message, /SERVER_URL/);
    assert.match(err.message, /AGENT_KEY/);
    assert.match(err.message, /LOCAL_SCAN_PORT/);
    assert.match(err.message, /INACTIVE_POLICY/);
  }
});

test('missing required settings', () => {
  assert.throws(() => parseConfig({}), (err: unknown) => err instanceof ConfigError && err.problems.length === 2);
});
