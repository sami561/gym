// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_PUBLIC, usePublicClasses, usePublicPlans } from './useLandingData';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

/** Same defaults as main.tsx (no refetch on focus): the public hooks must override them. */
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const switchTab = async (visible: boolean) => {
  await act(async () => {
    focusManager.setFocused(visible);
    await vi.advanceTimersByTimeAsync(0);
  });
};

describe('website freshness: planning and prices changed in the admin', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date('2026-11-03T10:00:00.000Z')); // Tuesday, 11:00 in Tunis
    fetchMock = vi.fn(async () => json([]));
    vi.stubGlobal('fetch', fetchMock);
    focusManager.setFocused(true);
  });

  afterEach(() => {
    focusManager.setFocused(undefined);
    vi.useRealTimers();
  });

  it('keeps the class schedule and the prices at most a minute old', () => {
    expect(LIVE_PUBLIC.staleTime).toBeLessThanOrEqual(60_000);
    expect(LIVE_PUBLIC.refetchInterval).toBeLessThanOrEqual(60_000);
    expect(LIVE_PUBLIC).toMatchObject({ refetchOnWindowFocus: true, refetchOnReconnect: true, refetchIntervalInBackground: false });
  });

  it('asks for the 7 gym days from midnight in Tunis', async () => {
    renderHook(() => usePublicClasses(), { wrapper: wrapper() });
    await act(() => vi.advanceTimersByTimeAsync(0));
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost');
    expect(url.pathname).toBe('/api/public/classes');
    expect(url.searchParams.get('from')).toBe('2026-11-02T23:00:00.000Z');
    expect(url.searchParams.get('to')).toBe('2026-11-09T23:00:00.000Z');
  });

  for (const [name, hook, path] of [
    ['classes', usePublicClasses, '/api/public/classes'],
    ['plans', usePublicPlans, '/api/public/plans'],
  ] as const) {
    it(`refetches the ${name} every minute and when the visitor comes back, not in a hidden tab`, async () => {
      renderHook(() => hook(), { wrapper: wrapper() });
      await act(() => vi.advanceTimersByTimeAsync(0));
      const calls = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith(path)).length;
      expect(calls()).toBe(1);

      // Back to the tab after 31 s: the answer is stale, ask again.
      await act(() => vi.advanceTimersByTimeAsync(31_000));
      expect(calls()).toBe(1);
      await switchTab(false);
      await switchTab(true);
      expect(calls()).toBe(2);

      // A minute after the last answer, the open page asks again by itself.
      await act(() => vi.advanceTimersByTimeAsync(59_000));
      expect(calls()).toBe(2);
      await act(() => vi.advanceTimersByTimeAsync(1_500));
      expect(calls()).toBe(3);

      // Hidden tab: no polling.
      await switchTab(false);
      await act(() => vi.advanceTimersByTimeAsync(180_000));
      expect(calls()).toBe(3);
    });
  }
});
