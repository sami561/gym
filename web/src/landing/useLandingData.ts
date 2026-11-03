import { useQuery } from '@tanstack/react-query';
import { publicApi } from '../api/endpoints';
import { FALLBACK_GYM } from '../lib/fallbacks';
import { addGymDays, gymDay, gymMidnight } from '../lib/gymTime';

/** Content that rarely changes (gym details, coaches, rooms): kept 5 minutes. */
const PUBLIC = { staleTime: 5 * 60_000, retry: 1 } as const;

/**
 * What the back office changes during the day (class planning, plan prices): the site asks again when the
 * visitor comes back to the tab or the network returns, and every minute while the page is in front, so a
 * change made in the admin shows up within a minute. The API does not cache these answers.
 */
export const LIVE_PUBLIC = {
  staleTime: 30_000,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  refetchInterval: 60_000,
  refetchIntervalInBackground: false,
  retry: 1,
} as const;

export function useGym() {
  const query = useQuery({ queryKey: ['public', 'gym'], queryFn: publicApi.gym, ...PUBLIC });
  return { ...query, gym: query.data ?? FALLBACK_GYM };
}

/** Plans on sale with their current prices (inactive plans are not sent). */
export function usePublicPlans() {
  return useQuery({ queryKey: ['public', 'plans'], queryFn: publicApi.plans, ...LIVE_PUBLIC });
}

/**
 * Classes of the 7 gym days starting today in Tunis: the same API and the same overlap rule as the back-office
 * planning (deleted classes are gone from both). The day is part of the key, so the week moves on at midnight
 * while the previous answer stays on screen.
 */
export function usePublicClasses() {
  const today = gymDay(new Date());
  return useQuery({
    queryKey: ['public', 'classes', today],
    queryFn: () => publicApi.classes(gymMidnight(today).toISOString(), gymMidnight(addGymDays(today, 7)).toISOString()),
    placeholderData: (previous) => previous,
    ...LIVE_PUBLIC,
  });
}

export function usePublicCoaches() {
  return useQuery({ queryKey: ['public', 'coaches'], queryFn: publicApi.coaches, ...PUBLIC });
}

export function usePublicRooms() {
  return useQuery({ queryKey: ['public', 'rooms'], queryFn: publicApi.rooms, ...PUBLIC });
}

/** Hours line for today ("06:00 – 22:00") from the opening hours list, best effort. */
export function todayHours(hours: { days: string; open: string; close: string }[]): string | null {
  const day = new Date().getDay(); // 0 = Sunday
  const sunday = hours.find((h) => /dim|sun/i.test(h.days));
  const week = hours.find((h) => !/dim|sun/i.test(h.days));
  const match = day === 0 ? sunday : week;
  return match ? `${match.open} – ${match.close}` : null;
}
