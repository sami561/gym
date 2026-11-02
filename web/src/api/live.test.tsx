// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthResult, UserDto } from './types';
import { renderInLang } from '../test/render';

type Live = typeof import('./live');
type Client = typeof import('./client');

const user: UserDto = {
  id: '0b6f8a52-3c1d-4e7a-9f10-2a5b7c9d1e01',
  email: 'accueil@example.com',
  phone: null,
  role: 'STAFF',
  firstName: 'Amira',
  lastName: 'Ben Salah',
  avatarUrl: null,
  specialty: null,
  bio: null,
  isActive: true,
  createdAt: '2026-01-05T08:00:00.000Z',
};

/** Session number n: tokens access-n / refresh-n. */
const tokens = (n: number): AuthResult => ({ accessToken: `access-${n}`, refreshToken: `refresh-${n}`, expiresIn: 900, user });

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

type Listener = (...args: unknown[]) => void;
type AuthOption = (send: (data: { token: string | null }) => void) => void;

/** Stand-in for the socket.io-client socket. The tests play the gateway: accept() and drop(). */
class FakeSocket {
  private readonly listeners = new Map<string, Listener[]>();
  private readonly auth: AuthOption;
  connected = false;
  /** connect() calls. socket.io opens the first connection by itself (autoConnect). */
  reconnects = 0;

  constructor(auth: AuthOption) {
    this.auth = auth;
  }

  on(event: string, listener: Listener) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  connect() {
    this.reconnects += 1;
    return this;
  }

  disconnect() {
    if (this.connected) {
      this.connected = false;
      this.fire('disconnect', 'io client disconnect');
    }
    return this;
  }

  /** Access token the next handshake sends: socket.io asks the auth callback on every attempt. */
  token(): string | null {
    let sent: string | null = null;
    this.auth(({ token }) => {
      sent = token;
    });
    return sent;
  }

  accept() {
    this.connected = true;
    this.fire('connect');
  }

  /** What the gateway does when the access token expires or is refused. */
  drop() {
    this.connected = false;
    this.fire('disconnect', 'io server disconnect');
  }

  private fire(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }
}

let live: Live;
let client: Client;
let sockets: FakeSocket[];
/** Answer of the gateway to /api/auth/refresh. */
let refresh: () => Response | Promise<Response>;
/** When each /api/auth/refresh call was made (fake clock). */
let refreshTimes: number[];

/** Time between consecutive refresh calls. */
const waits = () => refreshTimes.slice(1).map((time, index) => time - refreshTimes[index]);

function Probe() {
  const { status } = live.useLiveAccess();
  return <output aria-label="status">{status}</output>;
}

const status = () => screen.getByLabelText('status').textContent;

/** Mounts the hook; the gateway accepts the first connection. */
function openFeed() {
  const view = renderInLang(<Probe />);
  expect(sockets).toHaveLength(1);
  const socket = sockets[0];
  act(() => socket.accept());
  return { ...view, socket };
}

/** The gateway drops the socket, then the answer of the refresh comes back. */
const serverDrops = (socket: FakeSocket) =>
  act(async () => {
    socket.drop();
    await vi.advanceTimersByTimeAsync(0);
  });

/** Lets `ms` pass, running the retries due meanwhile. */
const elapse = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(async () => {
  // client.ts keeps the session at module level: load fresh copies per test.
  vi.resetModules();
  sockets = [];
  vi.doMock('socket.io-client', () => ({
    io: (_url: string, options: { auth: AuthOption }) => {
      const socket = new FakeSocket(options.auth);
      sockets.push(socket);
      return socket;
    },
  }));
  refreshTimes = [];
  refresh = () => json(503);
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input) => {
      if (!String(input).endsWith('/api/auth/refresh')) return json(404, {});
      refreshTimes.push(Date.now());
      return refresh();
    }),
  );
  live = await import('./live');
  client = await import('./client');
  client.session.set(tokens(1));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useLiveAccess: the gateway drops the socket when the access token expires', () => {
  it('refreshes the session and reconnects at once with the new token', async () => {
    refresh = () => json(200, tokens(2));
    const { socket } = openFeed();
    expect(status()).toBe('live');
    expect(socket.token()).toBe('access-1');

    await serverDrops(socket);

    expect(refreshTimes).toHaveLength(1);
    expect(socket.reconnects).toBe(1);
    expect(socket.token()).toBe('access-2');
    act(() => socket.accept());
    expect(status()).toBe('live');
  });

  it.each([
    ['the auth service is down', () => json(503)],
    ['the refresh is rate-limited', () => json(429, { statusCode: 429, message: 'Trop de requêtes.' })],
    ['the network is down', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('stays offline and does not reconnect with the refused token while %s', async (_, failure) => {
    refresh = failure;
    const { socket } = openFeed();

    await serverDrops(socket);
    await elapse(10 * 60_000);

    expect(socket.reconnects).toBe(0);
    expect(status()).toBe('offline');
    expect(client.session.getAccessToken()).toBe('access-1'); // kept: the refresh could not be checked
  });

  it('tries the refresh again after 2 s, doubling the wait up to 60 s', async () => {
    const { socket } = openFeed();

    await serverDrops(socket);
    await elapse(182_000);

    expect(waits()).toEqual([2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000]);
    expect(socket.reconnects).toBe(0);
  });

  it('reconnects as soon as a retry renews the session, then starts again from 2 s', async () => {
    const { socket } = openFeed();
    await serverDrops(socket);
    await elapse(14_000); // refresh calls at 0, 2, 6 and 14 s

    refresh = () => json(200, tokens(2));
    await elapse(16_000);
    expect(waits()).toEqual([2_000, 4_000, 8_000, 16_000]);
    expect(socket.reconnects).toBe(1);
    expect(socket.token()).toBe('access-2');
    expect(status()).toBe('offline');
    act(() => socket.accept());
    expect(status()).toBe('live');

    // access-2 expires in turn, while the auth service is down again
    refresh = () => json(503);
    refreshTimes = [];
    await serverDrops(socket);
    await elapse(6_000);
    expect(waits()).toEqual([2_000, 4_000]);
  });

  it('closes the feed and stops retrying when the user signs out', async () => {
    const { socket } = openFeed();
    await serverDrops(socket);
    expect(refreshTimes).toHaveLength(1);

    act(() => client.session.clear());
    await elapse(10 * 60_000);

    expect(refreshTimes).toHaveLength(1);
    expect(socket.reconnects).toBe(0);
    expect(status()).toBe('offline');
  });

  it('closes an open feed when the user signs out', () => {
    const { socket } = openFeed();
    act(() => client.session.clear());
    expect(socket.connected).toBe(false);
    expect(status()).toBe('offline');
  });

  it('stops when the refresh is refused: the session is over', async () => {
    refresh = () => json(401, { statusCode: 401, message: 'Session expirée.' });
    const { socket } = openFeed();

    await serverDrops(socket);
    await elapse(10 * 60_000);

    expect(client.session.getAccessToken()).toBeNull();
    expect(refreshTimes).toHaveLength(1);
    expect(socket.reconnects).toBe(0);
  });

  it('stops when the page closes while waiting to retry', async () => {
    const { socket, unmount } = openFeed();
    await serverDrops(socket);

    unmount();
    await elapse(10 * 60_000);

    expect(refreshTimes).toHaveLength(1);
    expect(socket.reconnects).toBe(0);
  });

  it('does not reconnect when the page closes during the refresh', async () => {
    const answer = deferred<Response>();
    refresh = () => answer.promise;
    const { socket, unmount } = openFeed();
    await serverDrops(socket);

    unmount();
    answer.resolve(json(200, tokens(2)));
    await elapse(10 * 60_000);

    expect(refreshTimes).toHaveLength(1);
    expect(socket.reconnects).toBe(0);
  });
});
