import { useQuery } from '@tanstack/react-query';
import { publicApi } from '../api/endpoints';
import { FALLBACK_GYM } from '../lib/fallbacks';
import { addDays } from '../lib/format';

const PUBLIC = { staleTime: 5 * 60_000, retry: 1 } as const;

export function useGym() {
  const query = useQuery({ queryKey: ['public', 'gym'], queryFn: publicApi.gym, ...PUBLIC });
  return { ...query, gym: query.data ?? FALLBACK_GYM };
}

export function usePublicPlans() {
  return useQuery({ queryKey: ['public', 'plans'], queryFn: publicApi.plans, ...PUBLIC });
}

export function usePublicClasses() {
  return useQuery({
    queryKey: ['public', 'classes'],
    queryFn: () => {
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      return publicApi.classes(from.toISOString(), addDays(from, 7).toISOString());
    },
    ...PUBLIC,
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
