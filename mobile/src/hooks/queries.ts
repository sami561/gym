import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { meApi, publicApi } from '@/api/endpoints';
import type { CreateBookingRequest, CreateMeasurementRequest, UpdateMeRequest } from '@/api/types';
import { addDays, startOfDay } from '@/lib/format';

export const queryKeys = {
  me: ['me'] as const,
  doors: ['doors'] as const,
  visits: ['visits'] as const,
  classes: (from: string, to: string) => ['classes', from, to] as const,
  bookings: ['bookings'] as const,
  standing: ['booking-standing'] as const,
  policy: ['booking-policy'] as const,
  classSearch: (id: string) => ['class-search', id] as const,
  gym: ['gym'] as const,
  programs: ['programs'] as const,
  measurements: ['measurements'] as const,
  ptSessions: ['pt-sessions'] as const,
};

export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: meApi.get });
}

export function useDoors() {
  return useQuery({ queryKey: queryKeys.doors, queryFn: meApi.doors, staleTime: 5 * 60_000 });
}

export function useVisits() {
  return useQuery({ queryKey: queryKeys.visits, queryFn: () => meApi.visits(50) });
}

/** Classes of the coming week (today 00:00 → +7 days). */
export function useWeekClasses() {
  const from = startOfDay();
  const to = addDays(from, 7);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  return useQuery({ queryKey: queryKeys.classes(fromIso, toIso), queryFn: () => meApi.classes(fromIso, toIso) });
}

/** Upcoming and past bookings (past ones carry ATTENDED / NO_SHOW / LATE_CANCELLED). */
export function useBookings() {
  return useQuery({ queryKey: queryKeys.bookings, queryFn: () => meApi.bookings(true) });
}

export function useBookingStanding() {
  return useQuery({ queryKey: queryKeys.standing, queryFn: meApi.bookingStanding, staleTime: 60_000 });
}

export function useBookingPolicy() {
  return useQuery({ queryKey: queryKeys.policy, queryFn: publicApi.bookingPolicy, staleTime: 60 * 60_000 });
}

/**
 * A class by id (class detail, push notification deep links): from the week already loaded,
 * then from my bookings, otherwise by searching the next three weeks.
 */
export function useClassSession(id: string | undefined) {
  const week = useWeekClasses();
  const bookings = useBookings();
  const fromWeek = id ? week.data?.find((s) => s.id === id) : undefined;
  const booking = id ? bookings.data?.find((b) => b.sessionId === id && b.session) : undefined;
  const search = useQuery({
    queryKey: queryKeys.classSearch(id ?? ''),
    enabled: !!id && week.isFetched && !fromWeek,
    queryFn: async () => {
      const from = startOfDay();
      const list = await meApi.classes(from.toISOString(), addDays(from, 21).toISOString());
      return list.find((s) => s.id === id) ?? null;
    },
  });
  const base = fromWeek ?? search.data ?? booking?.session ?? null;
  const session =
    base && booking && !base.bookingStatus
      ? {
          ...base,
          bookingId: booking.id,
          bookingStatus: booking.status,
          spotNumber: booking.spotNumber,
          waitlistPosition: booking.waitlistPosition,
        }
      : base;
  return {
    session,
    isPending: week.isPending || (!fromWeek && search.isPending && search.fetchStatus !== 'idle'),
    isError: week.isError && !session,
    error: week.error,
    refetch: () => Promise.all([week.refetch(), bookings.refetch(), search.refetch()]),
  };
}

export function useGymInfo() {
  return useQuery({ queryKey: queryKeys.gym, queryFn: publicApi.gym, staleTime: 60 * 60_000 });
}

export function usePrograms() {
  return useQuery({ queryKey: queryKeys.programs, queryFn: meApi.programs });
}

export function useMeasurements() {
  return useQuery({ queryKey: queryKeys.measurements, queryFn: meApi.measurements });
}

export function usePtSessions() {
  return useQuery({ queryKey: queryKeys.ptSessions, queryFn: meApi.ptSessions });
}

function useInvalidateBookings() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['classes'] }),
      client.invalidateQueries({ queryKey: ['class-search'] }),
      client.invalidateQueries({ queryKey: queryKeys.bookings }),
      client.invalidateQueries({ queryKey: queryKeys.standing }),
    ]);
}

export function useBookClass() {
  const invalidate = useInvalidateBookings();
  return useMutation({ mutationFn: (body: CreateBookingRequest) => meApi.book(body), onSettled: invalidate });
}

export function useCancelBooking() {
  const invalidate = useInvalidateBookings();
  return useMutation({ mutationFn: meApi.cancelBooking, onSettled: invalidate });
}

export function useUpdateMe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateMeRequest) => meApi.update(body),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.me }),
  });
}

export function useAddMeasurement() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMeasurementRequest) => meApi.addMeasurement(body),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.measurements }),
  });
}
