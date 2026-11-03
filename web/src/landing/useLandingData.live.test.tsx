// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { act, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderInLang } from '../test/render';
import { Schedule } from './sections/Schedule';
import { LIVE_PUBLIC, useGymToday, usePublicClasses, usePublicPlans } from './useLandingData';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

/** The public classes of today at the gym, as the schedule asks for them. */
const useTodayClasses = () => usePublicClasses(useGymToday());

/** Same defaults as the app (api/queryClient.ts: no refetch on focus): the public hooks must override them. */
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

  it('asks for the 7 gym days from midnight in Tunis, even on a device in another timezone', async () => {
    vi.stubEnv('TZ', 'America/Toronto'); // 05:00 there: midnight on the device is 05:00 UTC, not 23:00
    renderHook(useTodayClasses, { wrapper: wrapper() });
    await act(() => vi.advanceTimersByTimeAsync(0));
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost');
    expect(url.pathname).toBe('/api/public/classes');
    expect(url.searchParams.get('from')).toBe('2026-11-02T23:00:00.000Z');
    expect(url.searchParams.get('to')).toBe('2026-11-09T23:00:00.000Z');
  });

  it('moves the schedule to the new day at midnight in Tunis, even when the answers do not change', async () => {
    vi.setSystemTime(new Date('2026-11-03T22:55:00.000Z')); // Tuesday 23:55 in Tunis
    // The same class on Thursday in every answer: nothing in the data changes at midnight.
    const thursday = { startsAt: '2026-11-05T17:00:00.000Z', endsAt: '2026-11-05T18:00:00.000Z' };
    fetchMock.mockImplementation(async () =>
      json([{ id: 'c1', title: 'Body Pump', coachName: null, color: null, capacity: 20, bookedCount: 0, spotsLeft: 20, waitlistCount: 0, waitlistCapacity: 10, ...thursday }]),
    );
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: false } } });
    renderInLang(
      <QueryClientProvider client={client}>
        <Schedule />
      </QueryClientProvider>,
      'en',
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    const columns = () =>
      screen
        .getAllByRole('listitem')
        .filter((item) => item.parentElement?.tagName === 'OL')
        .map((item) => item.firstElementChild?.textContent);
    expect(columns()[0]).toBe('Tuesday 3');

    // 00:10 on Wednesday: the minute polls answered the same list all along.
    await act(() => vi.advanceTimersByTimeAsync(15 * 60_000));

    const froms = fetchMock.mock.calls.map(([url]) => new URL(String(url), 'http://localhost').searchParams.get('from'));
    expect(froms.at(-1)).toBe('2026-11-03T23:00:00.000Z');
    expect(columns()[0]).toBe('Wednesday 4');
    expect(columns()[6]).toBe('Tuesday 10');
  });

  for (const [name, hook, path] of [
    ['classes', useTodayClasses, '/api/public/classes'],
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
