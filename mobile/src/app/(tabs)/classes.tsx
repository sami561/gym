import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import type { BookingDto, ClassSessionDto } from '@/api/types';
import { AppText } from '@/components/AppText';
import { BookingStandingBanner } from '@/components/BookingStandingBanner';
import { ClassCard } from '@/components/ClassCard';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { SegmentedControl } from '@/components/SegmentedControl';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { useBookings, useBookingStanding, useWeekClasses } from '@/hooks/queries';
import { useBookingActions } from '@/hooks/useBookingActions';
import { useNow } from '@/hooks/useNow';
import { useI18n } from '@/i18n';
import { isBlocked } from '@/lib/classState';
import { addDays, formatShortDate, formatWeekday, isSameDay, startOfDay } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';

type Tab = 'schedule' | 'mine';

const openClass = (id: string) => router.push({ pathname: '/class/[id]', params: { id } });

/** A booking's session, enriched with the member's own booking fields. */
function bookingSession(booking: BookingDto): ClassSessionDto {
  return {
    ...booking.session!,
    bookingId: booking.id,
    bookingStatus: booking.status,
    spotNumber: booking.spotNumber,
    waitlistPosition: booking.waitlistPosition,
  };
}

export default function ClassesScreen() {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<Tab>('schedule');
  const [day, setDay] = useState(() => startOfDay());
  const now = useNow(60_000);

  const classes = useWeekClasses();
  const bookings = useBookings();
  const standing = useBookingStanding();
  const { reserve, busyId } = useBookingActions();
  const blocked = isBlocked(standing.data?.blockedUntil, now);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfDay(), i)), []);
  const sessions = useMemo(
    () =>
      (classes.data ?? [])
        .filter((s) => isSameDay(new Date(s.startsAt), day))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [classes.data, day],
  );
  const countByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of classes.data ?? []) {
      const key = startOfDay(new Date(s.startsAt)).toDateString();
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [classes.data]);

  const { upcoming, past } = useMemo(() => {
    const withSession = (bookings.data ?? []).filter((b) => b.session && b.status !== 'CANCELLED');
    return {
      upcoming: withSession
        .filter((b) => (b.status === 'BOOKED' || b.status === 'WAITLISTED') && new Date(b.session!.endsAt).getTime() > now)
        .sort((a, b) => a.session!.startsAt.localeCompare(b.session!.startsAt)),
      past: withSession
        .filter((b) => !(b.status === 'BOOKED' || b.status === 'WAITLISTED') || new Date(b.session!.endsAt).getTime() <= now)
        .sort((a, b) => b.session!.startsAt.localeCompare(a.session!.startsAt))
        .slice(0, 20),
    };
  }, [bookings.data, now]);

  const refresh = () => {
    classes.refetch();
    bookings.refetch();
    standing.refetch();
  };

  const dayLabel = (date: Date) =>
    isSameDay(date, new Date()) ? t('common.today') : `${formatWeekday(date, locale)} ${formatShortDate(date, locale)}`;

  return (
    <Screen onRefresh={refresh} refreshing={classes.isRefetching || bookings.isRefetching}>
      <AppText variant="display">{t('classes.title')}</AppText>
      <SegmentedControl<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'schedule', label: t('classes.schedule') },
          { value: 'mine', label: t('classes.myBookings') },
        ]}
      />
      <BookingStandingBanner />

      {tab === 'schedule' ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
            {days.map((date) => {
              const active = isSameDay(date, day);
              const count = countByDay.get(date.toDateString()) ?? 0;
              return (
                <Pressable
                  key={date.toISOString()}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    setDay(date);
                  }}
                  style={[styles.dayChip, active && styles.dayChipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <AppText style={[styles.dayName, active && styles.dayTextActive]}>{formatWeekday(date, locale)}</AppText>
                  <AppText style={[styles.dayNumber, active && styles.dayTextActive]}>{date.getDate()}</AppText>
                  <View style={[styles.dot, { opacity: count ? 1 : 0 }, active && styles.dotActive]} />
                </Pressable>
              );
            })}
          </ScrollView>

          {classes.isPending ? (
            <LoadingState />
          ) : classes.isError ? (
            <ErrorState error={classes.error} onRetry={() => classes.refetch()} />
          ) : sessions.length === 0 ? (
            <EmptyState icon="calendar-clear-outline" message={t('classes.empty')} />
          ) : (
            <View style={styles.list}>
              {sessions.map((session, index) => (
                <Animated.View key={session.id} entering={FadeInDown.delay(index * 50).duration(300)} layout={LinearTransition}>
                  <ClassCard
                    session={session}
                    blocked={blocked}
                    busy={busyId === session.id}
                    onOpen={() => openClass(session.id)}
                    onReserve={() => reserve(session)}
                  />
                </Animated.View>
              ))}
            </View>
          )}
        </>
      ) : bookings.isPending ? (
        <LoadingState />
      ) : bookings.isError ? (
        <ErrorState error={bookings.error} onRetry={() => bookings.refetch()} />
      ) : upcoming.length === 0 && past.length === 0 ? (
        <EmptyState
          icon="bookmark-outline"
          message={t('classes.emptyBookings')}
          action={{ label: t('classes.schedule'), onPress: () => setTab('schedule') }}
        />
      ) : (
        <View style={styles.list}>
          <SectionHeader title={t('classes.upcoming')} />
          {upcoming.length === 0 ? (
            <AppText variant="label">{t('classes.emptyBookings')}</AppText>
          ) : (
            upcoming.map((booking, index) => (
              <Animated.View key={booking.id} entering={FadeInDown.delay(index * 50).duration(300)} layout={LinearTransition}>
                <ClassCard
                  session={bookingSession(booking)}
                  dateLabel={dayLabel(new Date(booking.session!.startsAt))}
                  onOpen={() => openClass(booking.sessionId)}
                />
              </Animated.View>
            ))
          )}
          {past.length ? <SectionHeader title={t('classes.pastSection')} /> : null}
          {past.map((booking) => (
            <ClassCard
              key={booking.id}
              session={bookingSession(booking)}
              dateLabel={formatShortDate(booking.session!.startsAt, locale)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  days: { gap: spacing.sm, paddingVertical: spacing.xs },
  dayChip: {
    width: 56,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  dayChipActive: { backgroundColor: colors.red, borderColor: colors.red },
  dayName: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted, textTransform: 'capitalize' },
  dayNumber: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: colors.text },
  dayTextActive: { color: colors.white },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.red },
  dotActive: { backgroundColor: colors.white },
  list: { gap: spacing.md },
});
