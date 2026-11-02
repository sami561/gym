// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthResult, UserDto } from './types';
import { renderInLang } from '../test/render';

type Auth = typeof import('./auth');
type Client = typeof import('./client');

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

const refused = () => json(401, { statusCode: 401, message: 'Unauthorized' });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Lets every pending promise callback run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

let auth: Auth;
let client: Client;
/** Answer to the /auth/refresh call that restores the stored session on load. */
let restore: ReturnType<typeof deferred<Response>>;

function Probe() {
  const { status, login } = auth.useAuth();
  return (
    <div>
      <output aria-label="status">{status}</output>
      <button type="button" onClick={() => void login('accueil@example.com', 'secret')}>
        sign in
      </button>
    </div>
  );
}

const status = () => screen.getByLabelText('status').textContent;

function renderProvider() {
  return renderInLang(
    <auth.AuthProvider>
      <Probe />
    </auth.AuthProvider>,
  );
}

beforeEach(async () => {
  // client.ts keeps the session at module level: load fresh copies per test.
  vi.resetModules();
  localStorage.setItem(REFRESH_KEY, 'refresh-1'); // a session left from the last visit
  restore = deferred<Response>();
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/refresh')) return restore.promise;
      if (url.endsWith('/api/auth/login')) return json(200, tokens(9));
      return json(404, {});
    }),
  );
  auth = await import('./auth');
  client = await import('./client');
});

describe('AuthProvider: session restored on load', () => {
  it('opens the stored session', async () => {
    renderProvider();
    expect(status()).toBe('loading');
    restore.resolve(json(200, tokens(2)));
    await waitFor(() => expect(status()).toBe('authenticated'));
    expect(localStorage.getItem(REFRESH_KEY)).toBe('refresh-2');
  });

  it('shows the sign-in page when the stored session is refused', async () => {
    renderProvider();
    restore.resolve(refused());
    await waitFor(() => expect(status()).toBe('anonymous'));
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
  });

  it('keeps a sign-in made on the login page while the restore was running', async () => {
    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'sign in' }));
    await waitFor(() => expect(status()).toBe('authenticated'));

    await act(async () => {
      restore.resolve(refused()); // about the old session: ignored
      await settle();
    });

    expect(status()).toBe('authenticated');
    expect(client.session.getAccessToken()).toBe('access-9');
    expect(localStorage.getItem(REFRESH_KEY)).toBe('refresh-9');
  });

  it('shows the sign-in page, not an endless spinner, when another tab replaced the session meanwhile', async () => {
    renderProvider();
    await act(async () => {
      localStorage.setItem(REFRESH_KEY, 'refresh-7');
      restore.resolve(refused());
      await settle();
    });

    expect(status()).toBe('anonymous');
    expect(localStorage.getItem(REFRESH_KEY)).toBe('refresh-7');
  });
});
