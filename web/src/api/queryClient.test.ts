import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthResult } from './types';
import { memoryStorage } from '../test/storage';

type Client = typeof import('./client');
type QueryClientModule = typeof import('./queryClient');

const session = (n: number): AuthResult => ({
  accessToken: `access-${n}`,
  refreshToken: `refresh-${n}`,
  expiresIn: 900,
  user: {
    id: 'u-1',
    email: 'accueil@example.com',
    phone: null,
    role: 'STAFF',
    firstName: 'Nour',
    lastName: 'Accueil',
    avatarUrl: null,
    specialty: null,
    bio: null,
    isActive: true,
    createdAt: '2026-01-05T08:00:00.000Z',
  },
});

let client: Client;
let queryClientModule: QueryClientModule;

beforeEach(async () => {
  // client.ts keeps the session at module level: load fresh copies per test.
  vi.resetModules();
  vi.stubGlobal('localStorage', memoryStorage());
  client = await import('./client');
  queryClientModule = await import('./queryClient');
});

describe('the app query cache', () => {
  it('forgets every answer (member photos, lists) when the session ends', () => {
    const queryClient = queryClientModule.createQueryClient();
    client.session.set(session(1));
    const photo = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
    queryClient.setQueryData(['member-photo', 'm-1', 1793697300000], photo);
    queryClient.setQueryData(['members', { page: 1 }], { data: [] });

    client.session.clear();

    expect(queryClient.getQueryData(['member-photo', 'm-1', 1793697300000])).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
  });

  it('keeps them across a token refresh (same session)', () => {
    const queryClient = queryClientModule.createQueryClient();
    client.session.set(session(1));
    queryClient.setQueryData(['members', { page: 1 }], { data: [] });

    client.session.set(session(2));

    expect(queryClient.getQueryData(['members', { page: 1 }])).toEqual({ data: [] });
  });
});
