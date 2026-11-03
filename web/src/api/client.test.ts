import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthResult, UserDto } from './types';
import { blockedStorage, memoryStorage } from '../test/storage';

type Client = typeof import('./client');
type ApiErrorInstance = InstanceType<Client['ApiError']>;

const BASE = 'https://api.test';
const REFRESH_KEY = 'meliora.refreshToken';

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

/** Lets every pending promise callback run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

let client: Client;
let storage: Storage;
let fetchMock: Mock<typeof fetch>;

/** Gateway double: protected routes accept only `validToken`; /api/auth/refresh answers `refresh()`. */
const server = {
  validToken: '',
  refresh: (): Response | Promise<Response> => json(500),
};

interface SentRequest {
  url: string;
  auth: string | null;
  body: unknown;
}

function sent(): SentRequest[] {
  return fetchMock.mock.calls.map(([input, init]) => ({
    url: String(input),
    auth: new Headers(init?.headers).get('Authorization'),
    // JSON bodies are compared as values; a FormData (photo upload) as the object sent.
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : (init?.body ?? undefined),
  }));
}

const refreshCalls = () => sent().filter((request) => request.url === `${BASE}/api/auth/refresh`);
const callsTo = (path: string) => sent().filter((request) => request.url === `${BASE}${path}`);

async function failure(promise: Promise<unknown>): Promise<ApiErrorInstance> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(client.ApiError);
  return error as ApiErrorInstance;
}

beforeEach(async () => {
  // client.ts reads the base URL and keeps the session at module level: load a fresh copy per test.
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', `${BASE}/`);
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
  server.validToken = 'access-1';
  server.refresh = () => json(500);
  fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url === `${BASE}/api/auth/refresh`) return server.refresh();
    const auth = new Headers(init?.headers).get('Authorization');
    return auth === `Bearer ${server.validToken}`
      ? json(200, { path: new URL(url).pathname })
      : json(401, { statusCode: 401, message: 'Unauthorized' });
  });
  vi.stubGlobal('fetch', fetchMock);
  client = await import('./client');
});

describe('session', () => {
  it('keeps the access token in memory and only the refresh token in storage', () => {
    client.session.set(tokens(1));
    expect(client.session.getAccessToken()).toBe('access-1');
    expect(client.session.hasRefreshToken()).toBe(true);
    const stored = Array.from({ length: storage.length }, (_, index) => storage.getItem(storage.key(index) ?? ''));
    expect(stored).toEqual(['refresh-1']);
  });

  it('forgets both tokens on clear()', () => {
    client.session.set(tokens(1));
    client.session.clear();
    expect(client.session.getAccessToken()).toBeNull();
    expect(client.session.hasRefreshToken()).toBe(false);
    expect(storage.length).toBe(0);
  });

  it('tells subscribers about sign-in and sign-out until they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = client.session.subscribe(listener);
    client.session.set(tokens(1));
    client.session.clear();
    unsubscribe();
    client.session.set(tokens(2));
    expect(listener.mock.calls).toEqual([[tokens(1)], [null]]);
  });

  it('does not crash when the browser blocks storage, and keeps the refresh token for the tab', () => {
    vi.stubGlobal('localStorage', blockedStorage());
    expect(() => client.session.set(tokens(1))).not.toThrow();
    expect(client.session.getAccessToken()).toBe('access-1');
    expect(client.session.hasRefreshToken()).toBe(true);
    expect(() => client.session.clear()).not.toThrow();
    expect(client.session.hasRefreshToken()).toBe(false);
  });
});

describe('api()', () => {
  it('sends JSON with the bearer token and leaves empty query values out', async () => {
    client.session.set(tokens(1));
    fetchMock.mockResolvedValueOnce(json(201, { id: 'pay-1' }));

    const created = await client.api('/api/payments', {
      method: 'POST',
      body: { amount: 120.5 },
      query: { memberId: 'm-1', page: 2, notify: false, search: '', from: null, to: undefined },
    });

    expect(created).toEqual({ id: 'pay-1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/payments?memberId=m-1&page=2&notify=false`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer access-1' });
    expect(init?.body).toBe('{"amount":120.5}');
  });

  it('sends no token on public calls and no body on reads', async () => {
    client.session.set(tokens(1));
    fetchMock.mockResolvedValueOnce(json(200, []));
    await client.api('/api/public/plans', { auth: false });
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('GET');
    expect(init?.headers).toEqual({});
    expect(init?.body).toBeUndefined();
  });

  it('resolves empty answers to undefined', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    await expect(client.api('/api/lockers/1', { method: 'DELETE' })).resolves.toBeUndefined();
    await expect(client.api('/api/health')).resolves.toBeUndefined();
  });

  it('drops the trailing slash of VITE_API_URL', () => {
    expect(client.API_BASE).toBe(BASE);
  });
});

describe('refresh on 401', () => {
  it('shares one /auth/refresh call between requests that fail together, then replays them', async () => {
    client.session.set(tokens(1));
    server.validToken = 'access-2';
    const refresh = deferred<Response>();
    server.refresh = () => refresh.promise;

    const members = client.api('/api/members');
    const plans = client.api('/api/plans');
    await settle(); // both 401s are in, the refresh is still running
    expect(refreshCalls()).toHaveLength(1);

    refresh.resolve(json(200, tokens(2)));
    await expect(members).resolves.toEqual({ path: '/api/members' });
    await expect(plans).resolves.toEqual({ path: '/api/plans' });

    expect(refreshCalls()).toHaveLength(1);
    expect(refreshCalls()[0].body).toEqual({ refreshToken: 'refresh-1' });
    expect(callsTo('/api/members').map((request) => request.auth)).toEqual(['Bearer access-1', 'Bearer access-2']);
    expect(callsTo('/api/plans').map((request) => request.auth)).toEqual(['Bearer access-1', 'Bearer access-2']);
    expect(client.session.getAccessToken()).toBe('access-2');
    expect(storage.getItem(REFRESH_KEY)).toBe('refresh-2');
  });

  it('shares one call between direct refreshSession() callers (session restore, live feed)', async () => {
    storage.setItem(REFRESH_KEY, 'refresh-1');
    server.refresh = () => json(200, tokens(2));
    const [first, second] = await Promise.all([client.refreshSession(), client.refreshSession()]);
    expect(first).toEqual(tokens(2));
    expect(second).toBe(first);
    expect(refreshCalls()).toHaveLength(1);
  });

  it('always sends the newest refresh token, since each one works only once', async () => {
    client.session.set(tokens(1));
    server.validToken = 'access-2';
    server.refresh = () => json(200, tokens(2));
    await client.api('/api/members');

    // access-2 expires in turn
    server.validToken = 'access-3';
    server.refresh = () => json(200, tokens(3));
    await client.api('/api/members');

    expect(refreshCalls().map((request) => request.body)).toEqual([{ refreshToken: 'refresh-1' }, { refreshToken: 'refresh-2' }]);
    expect(storage.getItem(REFRESH_KEY)).toBe('refresh-3');
  });

  it.each([401, 403])('ends the session when the refresh is refused (%i)', async (status) => {
    client.session.set(tokens(1));
    const listener = vi.fn();
    client.session.subscribe(listener);
    server.validToken = 'access-2';
    server.refresh = () => json(status, { statusCode: status, message: 'Session expirée.' });

    const error = await failure(client.api('/api/members'));

    expect(error.status).toBe(401);
    expect(client.session.getAccessToken()).toBeNull();
    expect(storage.getItem(REFRESH_KEY)).toBeNull();
    expect(listener).toHaveBeenLastCalledWith(null);
    expect(callsTo('/api/members')).toHaveLength(1);
  });

  it.each([
    ['the gateway is down', () => json(503)],
    ['the network is down', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('keeps the session when the refresh cannot be checked (%s), so a later call can refresh', async (_, refresh) => {
    client.session.set(tokens(1));
    server.validToken = 'access-2';
    server.refresh = refresh;

    expect((await failure(client.api('/api/members'))).status).toBe(401);
    expect(storage.getItem(REFRESH_KEY)).toBe('refresh-1');

    server.refresh = () => json(200, tokens(2));
    await expect(client.api('/api/members')).resolves.toEqual({ path: '/api/members' });
    expect(refreshCalls().map((request) => request.body)).toEqual([{ refreshToken: 'refresh-1' }, { refreshToken: 'refresh-1' }]);
  });

  it('returns the 401 as is when there is no refresh token', async () => {
    server.validToken = 'access-2';
    const error = await failure(client.api('/api/members'));
    expect(error.status).toBe(401);
    expect(error.messages).toEqual(['Unauthorized']);
    expect(refreshCalls()).toHaveLength(0);
  });

  it('returns a 403 (role not allowed) as is, without refreshing or ending the session', async () => {
    client.session.set(tokens(1));
    fetchMock.mockResolvedValueOnce(json(403, { statusCode: 403, message: 'Accès refusé.' }));

    const error = await failure(client.api('/api/finance/summary'));

    expect(error.status).toBe(403);
    expect(error.messages).toEqual(['Accès refusé.']);
    expect(refreshCalls()).toHaveLength(0);
    expect(client.session.getAccessToken()).toBe('access-1');
    expect(storage.getItem(REFRESH_KEY)).toBe('refresh-1');
  });

  it('never refreshes for a public call answered 401 (wrong password at sign-in)', async () => {
    client.session.set(tokens(1));
    fetchMock.mockResolvedValueOnce(json(401, { statusCode: 401, message: 'E-mail ou mot de passe incorrect.' }));

    const error = await failure(client.api('/api/auth/login', { method: 'POST', auth: false, body: { email: 'accueil@example.com', password: 'x' } }));

    expect(error.message).toBe('E-mail ou mot de passe incorrect.');
    expect(refreshCalls()).toHaveLength(0);
    expect(storage.getItem(REFRESH_KEY)).toBe('refresh-1');
  });

  it('replays a request once only', async () => {
    client.session.set(tokens(1));
    server.validToken = 'none';
    server.refresh = () => json(200, tokens(2));

    expect((await failure(client.api('/api/members'))).status).toBe(401);
    expect(callsTo('/api/members').map((request) => request.auth)).toEqual(['Bearer access-1', 'Bearer access-2']);
    expect(refreshCalls()).toHaveLength(1);
  });

  it('keeps refreshing within the tab when the browser blocks storage', async () => {
    vi.stubGlobal('localStorage', blockedStorage());
    client.session.set(tokens(1));
    server.validToken = 'access-2';
    server.refresh = () => json(200, tokens(2));
    await expect(client.api('/api/members')).resolves.toEqual({ path: '/api/members' });

    // access-2 expires in turn: the rotated token, kept in memory, is the one sent
    server.validToken = 'access-3';
    server.refresh = () => json(200, tokens(3));
    await expect(client.api('/api/members')).resolves.toEqual({ path: '/api/members' });
    expect(refreshCalls().map((request) => request.body)).toEqual([{ refreshToken: 'refresh-1' }, { refreshToken: 'refresh-2' }]);

    // sign-out forgets it: the next 401 is returned as is
    client.session.clear();
    expect((await failure(client.api('/api/members'))).status).toBe(401);
    expect(refreshCalls()).toHaveLength(2);
  });

  it('also keeps it when storage reads but refuses writes (quota, older Safari private mode)', async () => {
    storage.setItem = () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
    client.session.set(tokens(1));
    server.validToken = 'access-2';
    server.refresh = () => json(200, tokens(2));
    await expect(client.api('/api/members')).resolves.toEqual({ path: '/api/members' });
    expect(refreshCalls().map((request) => request.body)).toEqual([{ refreshToken: 'refresh-1' }]);
  });
});

// The session can change while /auth/refresh runs: sign-out, sign-in on the shared front-desk PC,
// password change, another tab. mobile/src/api/client.ts has the same guard.
describe('a refresh answer that arrives after the session changed', () => {
  it('does not sign the user back in after sign-out', async () => {
    client.session.set(tokens(1));
    const refresh = deferred<Response>();
    server.refresh = () => refresh.promise;

    const pending = client.refreshSession();
    client.session.clear();
    refresh.resolve(json(200, tokens(2)));
    await pending;

    expect(client.session.getAccessToken()).toBeNull();
    expect(storage.getItem(REFRESH_KEY)).toBeNull();
  });

  it('does not end a session opened meanwhile (sign-in, password change)', async () => {
    client.session.set(tokens(1));
    const refresh = deferred<Response>();
    server.refresh = () => refresh.promise;

    const pending = client.refreshSession();
    client.session.set(tokens(9));
    refresh.resolve(json(401, { statusCode: 401, message: 'Unauthorized' }));
    await pending;

    expect(client.session.getAccessToken()).toBe('access-9');
    expect(storage.getItem(REFRESH_KEY)).toBe('refresh-9');
  });

  it('does not swap the session of the next person to sign in for the old one', async () => {
    client.session.set(tokens(1));
    const refresh = deferred<Response>();
    server.refresh = () => refresh.promise;

    const pending = client.refreshSession();
    client.session.clear();
    client.session.set(tokens(9));
    const listener = vi.fn();
    client.session.subscribe(listener);
    refresh.resolve(json(200, tokens(2)));

    await expect(pending).resolves.toBeNull();
    expect(client.session.getAccessToken()).toBe('access-9');
    expect(storage.getItem(REFRESH_KEY)).toBe('refresh-9');
    expect(listener).not.toHaveBeenCalled();
  });

  it('fails the request waiting on it instead of replaying it in a session it was not sent from', async () => {
    client.session.set(tokens(1));
    server.validToken = 'access-9';
    const refresh = deferred<Response>();
    server.refresh = () => refresh.promise;

    const members = client.api('/api/members');
    await settle(); // the 401 is in, the refresh is running
    client.session.clear();
    client.session.set(tokens(9));
    refresh.resolve(json(200, tokens(2)));

    expect((await failure(members)).status).toBe(401);
    expect(callsTo('/api/members').map((request) => request.auth)).toEqual(['Bearer access-1']);
    expect(client.session.getAccessToken()).toBe('access-9');
  });

  it('keeps the token another tab stored meanwhile', async () => {
    client.session.set(tokens(1));
    const refresh = deferred<Response>();
    server.refresh = () => refresh.promise;

    const pending = client.refreshSession();
    storage.setItem(REFRESH_KEY, 'refresh-7'); // the other tab refreshed first: refresh-1 is spent
    refresh.resolve(json(401, { statusCode: 401, message: 'Unauthorized' }));

    await expect(pending).resolves.toBeNull();
    expect(storage.getItem(REFRESH_KEY)).toBe('refresh-7');
  });
});

// Member photos: multipart upload, JPEG download (docs/API.md, "Member photos").
describe('FormData bodies and binary answers', () => {
  const jpegBytes = [0xff, 0xd8, 0xff, 0xd9];
  const jpeg = () => new Response(new Uint8Array(jpegBytes), { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
  const form = () => {
    const body = new FormData();
    body.append('photo', new Blob([new Uint8Array(jpegBytes)], { type: 'image/jpeg' }), 'photo.jpg');
    return body;
  };

  it('sends a FormData as is, without a JSON content type, so the browser writes the multipart boundary', async () => {
    client.session.set(tokens(1));
    fetchMock.mockResolvedValueOnce(json(200, { id: 'm-1', photoUpdatedAt: '2026-11-03T09:15:00.000Z' }));
    const body = form();

    const updated = await client.api('/api/members/m-1/photo', { method: 'PUT', body });

    expect(updated).toEqual({ id: 'm-1', photoUpdatedAt: '2026-11-03T09:15:00.000Z' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/members/m-1/photo`);
    expect(init?.method).toBe('PUT');
    expect(init?.headers).toEqual({ Authorization: 'Bearer access-1' });
    expect(init?.body).toBe(body);
  });

  it('replays the same FormData after refreshing an expired token', async () => {
    client.session.set(tokens(1));
    server.validToken = 'access-2';
    server.refresh = () => json(200, tokens(2));
    const body = form();

    await expect(client.api('/api/members/m-1/photo', { method: 'PUT', body })).resolves.toEqual({ path: '/api/members/m-1/photo' });

    expect(callsTo('/api/members/m-1/photo').map((request) => [request.auth, request.body])).toEqual([
      ['Bearer access-1', body],
      ['Bearer access-2', body],
    ]);
    expect(refreshCalls()).toHaveLength(1);
  });

  it('keeps the French refusal of an upload', async () => {
    fetchMock.mockResolvedValueOnce(json(413, { statusCode: 413, message: 'La photo dépasse 512 Ko.' }));
    const error = await failure(client.api('/api/members/m-1/photo', { method: 'PUT', body: form() }));
    expect(error.status).toBe(413);
    expect(client.errorMessage(error)).toBe('La photo dépasse 512 Ko.');
  });

  it('reads a binary answer as a Blob, sent with the token and no body', async () => {
    client.session.set(tokens(1));
    fetchMock.mockResolvedValueOnce(jpeg());

    const photo = await client.apiBlob('/api/members/m-1/photo', { query: { v: 1793697300000 } });

    expect(photo.type).toBe('image/jpeg');
    expect([...new Uint8Array(await photo.arrayBuffer())]).toEqual(jpegBytes);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/members/m-1/photo?v=1793697300000`);
    expect(init?.method).toBe('GET');
    expect(init?.headers).toEqual({ Authorization: 'Bearer access-1' });
    expect(init?.body).toBeUndefined();
  });

  it('refreshes an expired token before reading a binary answer', async () => {
    client.session.set(tokens(1));
    server.validToken = 'access-2';
    server.refresh = () => json(200, tokens(2));

    const answer = await client.apiBlob('/api/members/m-1/photo');

    expect(await answer.text()).toBe('{"path":"/api/members/m-1/photo"}');
    expect(callsTo('/api/members/m-1/photo').map((request) => request.auth)).toEqual(['Bearer access-1', 'Bearer access-2']);
  });

  it('turns an error answer into an ApiError with the message of the API (no photo)', async () => {
    fetchMock.mockResolvedValueOnce(json(404, { statusCode: 404, message: 'Aucune photo.' }));
    const error = await failure(client.apiBlob('/api/members/m-1/photo'));
    expect(error.status).toBe(404);
    expect(error.messages).toEqual(['Aucune photo.']);
  });

  it('membersApi sends the photo as the multipart field "photo" and asks for a version with v', async () => {
    const { membersApi } = await import('./endpoints');
    client.session.set(tokens(1));
    fetchMock.mockResolvedValueOnce(json(200, { id: 'm-1' }));
    fetchMock.mockResolvedValueOnce(jpeg());
    fetchMock.mockResolvedValueOnce(jpeg());
    fetchMock.mockResolvedValueOnce(json(200, { id: 'm-1', photoUpdatedAt: null }));

    await membersApi.setPhoto('m-1', new Blob([new Uint8Array(jpegBytes)], { type: 'image/jpeg' }));
    await membersApi.photo('m-1', 1793697300000);
    await membersApi.photo('m-1');
    await membersApi.removePhoto('m-1');

    const calls = fetchMock.mock.calls.map(([url, init]) => [init?.method, String(url)]);
    expect(calls).toEqual([
      ['PUT', `${BASE}/api/members/m-1/photo`],
      ['GET', `${BASE}/api/members/m-1/photo?v=1793697300000`],
      ['GET', `${BASE}/api/members/m-1/photo`],
      ['DELETE', `${BASE}/api/members/m-1/photo`],
    ]);
    const sentFile = (fetchMock.mock.calls[0][1]?.body as FormData).get('photo') as File;
    expect([sentFile.name, sentFile.type, sentFile.size]).toEqual(['photo.jpg', 'image/jpeg', 4]);
  });
});

describe('errors', () => {
  it('keeps every validation message of the API', async () => {
    fetchMock.mockResolvedValueOnce(json(400, { statusCode: 400, message: ['email must be an email', 'password is too short'] }));
    const error = await failure(client.api('/api/users', { method: 'POST', body: {} }));
    expect(error.status).toBe(400);
    expect(error.message).toBe('email must be an email');
    expect(client.errorMessage(error)).toBe('email must be an email · password is too short');
  });

  it('reads a single message string', async () => {
    fetchMock.mockResolvedValueOnce(json(409, { statusCode: 409, message: 'Ce casier est déjà attribué.' }));
    expect((await failure(client.api('/api/lockers/1/assign', { method: 'POST' }))).messages).toEqual(['Ce casier est déjà attribué.']);
  });

  it('explains answers that carry no message', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>Bad Gateway</html>', { status: 502 }));
    fetchMock.mockResolvedValueOnce(json(404, {}));
    expect((await failure(client.api('/api/members'))).messages).toEqual(['Le serveur ne répond pas correctement. Réessayez dans un instant.']);
    expect((await failure(client.api('/api/members/x'))).messages).toEqual(['Requête refusée (404).']);
  });

  it('turns a network failure into a readable error with status 0', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const error = await failure(client.api('/api/members'));
    expect(error.status).toBe(0);
    expect(error.message).toBe('Impossible de joindre le serveur. Vérifiez votre connexion.');
  });

  it('lets an aborted request reject with its AbortError', async () => {
    const controller = new AbortController();
    fetchMock.mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'));
    const error = await client.api('/api/members', { signal: controller.signal }).catch((reason: unknown) => reason);
    expect(error).not.toBeInstanceOf(client.ApiError);
    expect((error as DOMException).name).toBe('AbortError');
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it('errorMessage reads anything that was thrown', () => {
    expect(client.errorMessage(new Error('Boom'))).toBe('Boom');
    expect(client.errorMessage('boom')).toBe('Erreur inattendue.');
    expect(new client.ApiError(500, []).message).toBe('Erreur inattendue.');
  });
});
