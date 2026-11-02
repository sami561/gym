import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ApiError, api, session } from './client';
import type { AuthResult, UserDto } from './types';

// In-memory token store instead of SecureStore.
jest.mock('@/lib/storage', () => {
  const store = new Map<string, unknown>();
  return {
    STORAGE_KEYS: { tokens: 'meliora.tokens' },
    storage: {
      getJSON: async (key: string) => store.get(key) ?? null,
      setJSON: async (key: string, value: unknown) => void store.set(key, value),
      remove: async (key: string) => void store.delete(key),
    },
  };
});

function response(status: number, body?: unknown, bodyReady: Promise<void> = Promise.resolve()): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      await bodyReady;
      return body;
    },
    text: async () => {
      await bodyReady;
      return body === undefined ? '' : JSON.stringify(body);
    },
  } as unknown as Response;
}

function authResult(name: string): AuthResult {
  return { accessToken: `access-${name}`, refreshToken: `refresh-${name}`, expiresIn: 900, user: { id: 'u1' } as UserDto };
}

/** Requests the client sent: "<path> <bearer>" (the body of a refresh is its refresh token). */
let sent: string[] = [];
let refreshReply: () => Response | Promise<Response>;

beforeEach(async () => {
  sent = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const path = String(url).replace(/^.*\/api/, '');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (path === '/auth/refresh') {
      sent.push(`${path} ${JSON.parse(String(init?.body)).refreshToken}`);
      return refreshReply();
    }
    sent.push(`${path} ${headers.Authorization ?? ''}`);
    return headers.Authorization === 'Bearer access-old' ? response(401, { message: 'expired' }) : response(200, { ok: true });
  }) as typeof fetch;
  await session.save({ accessToken: 'access-old', refreshToken: 'refresh-old' });
});

const ticks = async (n = 10) => {
  for (let i = 0; i < n; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('api() and refresh tokens (single-use, rotated on every refresh)', () => {
  it('stores the rotated pair and retries with it', async () => {
    const onRefreshed = jest.fn();
    session.setHandlers({ onSessionExpired: jest.fn(), onRefreshed });
    refreshReply = () => response(200, authResult('rotated'));

    await expect(api('/me')).resolves.toEqual({ ok: true });
    expect(sent).toEqual(['/me Bearer access-old', '/auth/refresh refresh-old', '/me Bearer access-rotated']);
    expect(onRefreshed).toHaveBeenCalledTimes(1);

    // The next refresh sends the rotated token, never the used one.
    await session.save({ accessToken: 'access-old', refreshToken: 'refresh-rotated' });
    await api('/me');
    expect(sent).toContain('/auth/refresh refresh-rotated');
  });

  it('keeps a session stored while the refresh answer was still being read (password change)', async () => {
    const onRefreshed = jest.fn();
    const onSessionExpired = jest.fn();
    session.setHandlers({ onSessionExpired, onRefreshed });
    let releaseBody!: () => void;
    const bodyReady = new Promise<void>((resolve) => (releaseBody = resolve));
    // The refresh of the old login answers, but its body arrives late...
    refreshReply = () => response(200, authResult('stale'), bodyReady);

    const pending = api('/me');
    await ticks();
    expect(sent).toContain('/auth/refresh refresh-old');
    // ...meanwhile PATCH /auth/password answered and its fresh session was stored.
    await session.save(authResult('new'));
    releaseBody();

    await expect(pending).resolves.toEqual({ ok: true });
    expect(sent[sent.length - 1]).toBe('/me Bearer access-new');
    expect(onRefreshed).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('does not sign out a newer session when the old refresh is refused', async () => {
    const onSessionExpired = jest.fn();
    session.setHandlers({ onSessionExpired, onRefreshed: jest.fn() });
    let release!: () => void;
    const answered = new Promise<void>((resolve) => (release = resolve));
    // The old login was revoked by the password change: its refresh is refused, after the new session is stored.
    refreshReply = () => answered.then(() => response(401, { message: 'Session expirée, reconnectez-vous.' }));

    const pending = api('/me');
    await ticks();
    await session.save(authResult('new'));
    release();

    await expect(pending).resolves.toEqual({ ok: true });
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(session.hasTokens()).toBe(true);
  });

  it('keeps the session when the refresh fails with a server error or a rate limit', async () => {
    const onSessionExpired = jest.fn();
    session.setHandlers({ onSessionExpired, onRefreshed: jest.fn() });
    for (const status of [502, 429]) {
      refreshReply = () => response(status, { message: 'Indisponible' });
      const error = await api('/me').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status, kind: 'http' });
    }
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(session.hasTokens()).toBe(true);
  });

  it('signs out when the refresh of the current session is refused', async () => {
    const onSessionExpired = jest.fn();
    session.setHandlers({ onSessionExpired, onRefreshed: jest.fn() });
    refreshReply = () => response(401, { message: 'Session expirée, reconnectez-vous.' });

    const error = await api('/me').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('session');
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(session.hasTokens()).toBe(false);
  });
});
