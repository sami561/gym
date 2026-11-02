import { describe, it, test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'http';
import { HttpRelayDriver, parseHttpRelayConfig } from '../src/doors/http-relay';
import { captureLogger } from './helpers/capture-logger';
import { door, driverContext } from './helpers/fixtures';
import { close, freePort, listen, waitFor } from './helpers/net';

interface SeenRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/** Local stand-in for a Shelly / ESP32 relay on 127.0.0.1. */
async function startRelay(t: TestContext) {
  const relay = {
    base: '',
    requests: [] as SeenRequest[],
    /** Answer to the next requests; null = never answer. */
    answer: { status: 200, body: '{"was_on":false}' } as { status: number; body: string } | null,
    openConnections: 0,
  };
  const server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => (body += chunk));
    req.on('end', () => {
      relay.requests.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      const answer = relay.answer;
      if (!answer) return;
      res.writeHead(answer.status);
      res.end(answer.body);
    });
  });
  server.on('connection', (socket) => {
    relay.openConnections++;
    socket.on('close', () => relay.openConnections--);
  });
  relay.base = `http://127.0.0.1:${await listen(server)}`;
  t.after(() => {
    server.closeAllConnections();
    return close(server);
  });
  return relay;
}

function relayDriver(config: Record<string, unknown>, doorId = 'door-relay') {
  const { logger, entries } = captureLogger();
  const driver = new HttpRelayDriver(door({ id: doorId, driver: 'HTTP_RELAY', config }), driverContext(logger));
  return { driver, entries };
}

const basic = (credentials: string) => `Basic ${Buffer.from(credentials).toString('base64')}`;

describe('HttpRelayDriver', { concurrency: true }, () => {
  it('GET: fills {seconds}, {ms} and {doorId} in the URL and headers, sends Basic auth and no body', async (t) => {
    const relay = await startRelay(t);
    const { driver } = relayDriver(
      {
        url: `${relay.base}/rpc/Switch.Set?toggle_after={seconds}&ms={ms}&door={doorId}`,
        headers: { 'X-Unlock-Ms': '{ms}' },
        basicAuth: { username: 'admin', password: 'secret' },
        body: { ignored: true },
      },
      'porte vestiaires/1',
    );
    await driver.open(4);

    assert.equal(relay.requests.length, 1);
    const [request] = relay.requests;
    assert.equal(request.method, 'GET');
    assert.equal(request.url, '/rpc/Switch.Set?toggle_after=4&ms=4000&door=porte%20vestiaires%2F1');
    assert.equal(request.headers['x-unlock-ms'], '4000');
    assert.equal(request.headers.authorization, basic('admin:secret'));
    assert.equal(request.body, '');
    assert.deepEqual(driver.status(), { status: 'ok' });
  });

  it('POST: sends the JSON body with the placeholders filled', async (t) => {
    const relay = await startRelay(t);
    const { driver } = relayDriver({
      url: `${relay.base}/open`,
      method: 'post',
      headers: { 'X-Token': 'esp32-token' },
      body: { seconds: '{seconds}', ms: '{ms}', door: '{doorId}' },
    });
    await driver.open(3);

    const [request] = relay.requests;
    assert.equal(request.method, 'POST');
    assert.equal(request.headers['content-type'], 'application/json');
    assert.equal(request.headers['x-token'], 'esp32-token');
    assert.deepEqual(JSON.parse(request.body), { seconds: '3', ms: '3000', door: 'door-relay' });
  });

  it('PUT: sends a text body as configured', async (t) => {
    const relay = await startRelay(t);
    const { driver } = relayDriver({ url: `${relay.base}/relay`, method: 'PUT', body: 'pulse={ms}' });
    await driver.open(2);
    assert.equal(relay.requests[0].method, 'PUT');
    assert.equal(relay.requests[0].body, 'pulse=2000');
  });

  it('an HTTP error fails the open with the status and the start of the answer', async (t) => {
    const relay = await startRelay(t);
    relay.answer = { status: 503, body: `relay busy: ${'x'.repeat(300)}` };
    const { driver } = relayDriver({ url: `${relay.base}/open` });

    await assert.rejects(driver.open(3), (err: Error) => {
      assert.equal(err.message, `Relay answered HTTP 503: relay busy: ${'x'.repeat(200 - 'relay busy: '.length)}`);
      return true;
    });
    assert.equal(driver.status().status, 'error');
    assert.match(driver.status().error ?? '', /^Relay answered HTTP 503/);
  });

  it('a successful open clears the previous error', async (t) => {
    const relay = await startRelay(t);
    relay.answer = { status: 500, body: '' };
    const { driver } = relayDriver({ url: `${relay.base}/open` });
    await assert.rejects(driver.open(3), { message: 'Relay answered HTTP 500' });

    relay.answer = { status: 200, body: 'ok' };
    await driver.open(3);
    assert.deepEqual(driver.status(), { status: 'ok' });
  });

  it('a relay that never answers fails after timeoutMs and the request is aborted', async (t) => {
    const relay = await startRelay(t);
    relay.answer = null;
    const { driver } = relayDriver({ url: `${relay.base}/open`, timeoutMs: 300 });

    const started = Date.now();
    await assert.rejects(driver.open(3), { message: 'relay request timed out after 300 ms' });
    assert.ok(Date.now() - started < 3000, 'gave up in time');
    // Without the abort the connection would stay open until the relay answers.
    await waitFor(() => relay.openConnections === 0, 'the abandoned connection to close');
    assert.equal(driver.status().error, 'relay request timed out after 300 ms');
  });

  it('an unreachable relay fails the open and reports an error', async () => {
    const port = await freePort();
    const { driver } = relayDriver({ url: `http://127.0.0.1:${port}/open` });
    await assert.rejects(driver.open(3));
    assert.equal(driver.status().status, 'error');
  });

  it('a door without a usable URL logs the problem and every open fails with it', async () => {
    const expected = 'HTTP_RELAY door needs config.url (http:// or https://)';
    const { driver, entries } = relayDriver({ url: 'ftp://192.168.1.50/open' });
    await driver.start();
    assert.ok(entries.some((entry) => entry.level === 'error' && entry.msg === 'invalid relay configuration' && entry.error === expected));
    assert.deepEqual(driver.status(), { status: 'error', error: expected });
    await assert.rejects(driver.open(3), { message: expected });
  });

  it('logs the relay URL without its password', async () => {
    const { driver, entries } = relayDriver({ url: 'http://admin:s3cret@192.168.1.50/relay/0?turn=on' });
    await driver.start();
    assert.equal(entries.find((entry) => entry.msg === 'relay ready')?.url, 'http://admin:***@192.168.1.50/relay/0?turn=on');
    assert.ok(!JSON.stringify(entries).includes('s3cret'));
  });

  it(
    'credentials in the URL never leak into errors and are sent as Basic auth',
    {
      todo:
        'BUG src/doors/http-relay.ts: fetch() refuses URLs with credentials, so every open fails, and the error ' +
        '(logged, kept in status() and sent in heartbeats) contains the plaintext password',
    },
    async (t) => {
      const relay = await startRelay(t);
      const { driver } = relayDriver({ url: `${relay.base.replace('http://', 'http://admin:s3cret@')}/relay/0?turn=on` });
      const failure = await driver.open(3).then(
        () => null,
        (err: Error) => err,
      );
      assert.ok(!String(failure?.message).includes('s3cret'), 'password in the open() error');
      assert.ok(!(driver.status().error ?? '').includes('s3cret'), 'password in status()');
      assert.equal(failure, null);
      assert.equal(relay.requests[0]?.headers.authorization, basic('admin:s3cret'));
    },
  );

  it(
    'a configured content-type is kept as is for an object body',
    {
      todo:
        'BUG src/doors/http-relay.ts: the JSON default is added unless the exact key "Content-Type" exists, ' +
        'so a lowercase "content-type" header goes out as "text/plain, application/json"',
    },
    async (t) => {
      const relay = await startRelay(t);
      const { driver } = relayDriver({
        url: `${relay.base}/open`,
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: { seconds: '{seconds}' },
      });
      await driver.open(3);
      assert.equal(relay.requests[0].headers['content-type'], 'text/plain');
    },
  );
});

test('relay config: defaults, method and URL validation', () => {
  assert.deepEqual(parseHttpRelayConfig({ url: '  http://10.0.0.9/open  ' }), {
    url: 'http://10.0.0.9/open',
    method: 'GET',
    headers: {},
    body: null,
    timeoutMs: 5000,
  });
  assert.equal(parseHttpRelayConfig({ url: 'https://relay.local/x', method: 'put' }).method, 'PUT');
  assert.throws(() => parseHttpRelayConfig({ url: 'http://x', method: 'DELETE' }), /Unsupported HTTP method DELETE/);
  for (const url of [undefined, '', 'relay.local/open', 42]) {
    assert.throws(() => parseHttpRelayConfig({ url }), /needs config\.url/, String(url));
  }
});

test('relay config: headers, Basic auth, text bodies and timeouts', () => {
  assert.deepEqual(parseHttpRelayConfig({ url: 'http://x', headers: { 'X-A': 1, 'X-B': null, 'X-C': undefined, 'X-D': true } }).headers, {
    'X-A': '1',
    'X-D': 'true',
  });
  assert.equal(parseHttpRelayConfig({ url: 'http://x', basicAuth: { username: 'admin' } }).headers.Authorization, basic('admin:'));
  assert.equal(parseHttpRelayConfig({ url: 'http://x', basicAuth: { password: 'only' } }).headers.Authorization, undefined);

  const text = parseHttpRelayConfig({ url: 'http://x', method: 'POST', body: 'on={seconds}' });
  assert.equal(text.body, 'on={seconds}');
  assert.equal(text.headers['Content-Type'], undefined);

  const timeouts: [unknown, number][] = [
    [3000, 3000],
    ['2500', 2500],
    [0, 5000],
    [-1, 5000],
    ['soon', 5000],
  ];
  for (const [raw, expected] of timeouts) {
    assert.equal(parseHttpRelayConfig({ url: 'http://x', timeoutMs: raw }).timeoutMs, expected, String(raw));
  }
});
