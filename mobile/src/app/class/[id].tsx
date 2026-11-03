import { ComponentProps, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { BookingStandingBanner } from '@/components/BookingStandingBanner';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { SpotPicker } from '@/components/SpotPicker';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { StatusPill } from '@/components/StatusPill';
import { useBookingPolicy, useBookingStanding, useClassSession } from '@/hooks/queries';
import { useBookingActions } from '@/hooks/useBookingActions';
import { useNow } from '@/hooks/useNow';
import { useI18n } from '@/i18n';
import { bookingTone, classAction, isBlocked, isCancellable, isLateCancellation } from '@/lib/classState';
import { formatDate, formatTime } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import { mirrorInRTL } from '@/lib/direction';

type IconName = ComponentProps<typeof Ionicons>['name'];

function InfoLine({ icon, text, color }: { icon: IconName; text: string; color?: string }) {
  return (
    <View style={styles.infoLine}>
      <Ionicons name={icon} size={16} color={color ?? colors.steel} />
      <AppText variant="label" color={color} style={styles.flex}>
        {text}
      </AppText>
    </View>
  );
}

export default function ClassDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useI18n();
  const now = useNow(30_000);
  const { session, isPending, isError, error, refetch } = useClassSession(id);
  const standing = useBookingStanding();
  const policy = useBookingPolicy();
  const { reserve, confirmCancel, busyId } = useBookingActions();
  const [spot, setSpot] = useState<number | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/classes'));

  const topBar = (
    <View style={styles.topBar}>
      <Pressable onPress={back} hitSlop={12} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common.close')}>
        <Ionicons name="chevron-back" size={22} color={colors.text} style={mirrorInRTL} />
      </Pressable>
      <AppText variant="heading">{t('classes.details')}</AppText>
    </View>
  );

  if (isPending) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {topBar}
        <LoadingState />
      </SafeAreaView>
    );
  }
  if (!session) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {topBar}
        {isError ? <ErrorState error={error} onRetry={refetch} /> : <EmptyState icon="calendar-clear-outline" message={t('classes.notFound')} />}
      </SafeAreaView>
    );
  }

  const blocked = isBlocked(standing.data?.blockedUntil, now);
  const action = classAction(session, now, blocked);
  const accent = session.color || colors.red;
  const spotsLeft = session.spotsLeft ?? Math.max(0, session.capacity - session.bookedCount);
  const busy = busyId === session.id;
  const cancelDeadlinePassed = isLateCancellation(session.cancelDeadline, now);
  const dateTime = (iso: string) => `${formatDate(iso, locale, { weekday: 'long', day: 'numeric', month: 'long' })} · ${formatTime(iso, locale)}`;
  const status = action.kind === 'mine' ? action.status : null;
  const showPicker = session.spotSelection && (action.kind === 'chooseSpot' || status === 'BOOKED');

  const book = async () => {
    const booking = await reserve(session, session.spotSelection ? spot ?? undefined : undefined);
    if (booking) setSpot(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {topBar}
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.duration(300)}>
          <Card style={styles.headerCard}>
            <View style={[styles.accent, { backgroundColor: accent }]} />
            <AppText variant="display">{session.title}</AppText>
            <InfoLine icon="calendar-outline" text={`${dateTime(session.startsAt)} – ${formatTime(session.endsAt, locale)}`} />
            {session.coachName ? <InfoLine icon="person-outline" text={t('classes.coach', { name: session.coachName })} /> : null}
            {session.room ? <InfoLine icon="location-outline" text={session.room} /> : null}
            {session.description ? (
              <AppText variant="body" color={colors.textMuted}>
                {session.description}
              </AppText>
            ) : null}
          </Card>
        </Animated.View>

        <BookingStandingBanner />

        <Animated.View entering={FadeInDown.delay(80).duration(300)}>
          <Card style={styles.statusCard}>
            {status ? (
              <StatusPill
                label={`${t(`classes.status.${status}`, { position: session.waitlistPosition ?? '?' })}${
                  status === 'BOOKED' && session.spotNumber ? ` · ${t('classes.spotN', { n: session.spotNumber })}` : ''
                }`}
                tone={bookingTone[status]}
              />
            ) : null}
            <View style={styles.capacity}>
              <AppText variant="title">
                {spotsLeft > 0 ? t('classes.spotsLeft', { count: spotsLeft }) : t('classes.full')}
              </AppText>
              <AppText variant="caption">
                {t('classes.spots', { booked: session.capacity - spotsLeft, capacity: session.capacity })}
                {session.waitlistCount ? ` · ${t('classes.waitlistCount', { count: session.waitlistCount })}` : ''}
              </AppText>
            </View>
            {action.kind === 'notOpen' ? (
              <InfoLine icon="time-outline" text={t('classes.opensOn', { date: dateTime(action.opensAt) })} />
            ) : null}
            {action.kind === 'closed' ? <InfoLine icon="lock-closed-outline" text={t('classes.closed')} /> : null}
            {status === 'BOOKED' || action.kind === 'book' || action.kind === 'chooseSpot' || action.kind === 'waitlist' ? (
              cancelDeadlinePassed ? (
                <InfoLine
                  icon="alert-circle-outline"
                  color={colors.amber}
                  text={t('classes.cancelPassed', { date: dateTime(session.cancelDeadline) })}
                />
              ) : (
                <InfoLine icon="shield-checkmark-outline" text={t('classes.cancelUntil', { date: dateTime(session.cancelDeadline) })} />
              )
            ) : null}
            {status === 'BOOKED' && policy.data ? (
              <InfoLine icon="walk-outline" text={t('classes.checkinHint', { minutes: policy.data.checkinWindowMinutes })} />
            ) : null}
            {status === 'WAITLISTED' || action.kind === 'waitlist' ? (
              <InfoLine icon="notifications-outline" text={t('classes.waitlistHint')} />
            ) : null}
          </Card>
        </Animated.View>

        {showPicker ? (
          <Animated.View entering={FadeInDown.delay(140).duration(300)} style={styles.section}>
            <AppText variant="overline">{t('classes.pickSpot')}</AppText>
            <SpotPicker
              capacity={session.capacity}
              taken={session.takenSpots ?? []}
              mine={status === 'BOOKED' ? session.spotNumber : null}
              selected={spot}
              onSelect={action.kind === 'chooseSpot' ? setSpot : undefined}
              disabled={action.kind !== 'chooseSpot'}
            />
          </Animated.View>
        ) : null}
      </ScrollView>

      <Animated.View entering={FadeInUp.delay(120).duration(300)} style={styles.actionBar}>
        {action.kind === 'book' ? (
          <Button title={t('classes.book')} size="lg" icon="add-circle-outline" loading={busy} onPress={book} />
        ) : action.kind === 'chooseSpot' ? (
          <Button
            title={spot ? t('classes.bookSpot', { n: spot }) : t('classes.spotRequired')}
            size="lg"
            icon="checkmark-circle-outline"
            disabled={!spot}
            loading={busy}
            onPress={book}
          />
        ) : action.kind === 'waitlist' ? (
          <Button title={t('classes.joinWaitlist')} size="lg" variant="secondary" icon="hourglass-outline" loading={busy} onPress={book} />
        ) : action.kind === 'full' ? (
          <Button title={t('classes.waitlistFull')} size="lg" variant="secondary" disabled />
        ) : status && isCancellable(status) && session.bookingId ? (
          <Button
            title={status === 'WAITLISTED' ? t('classes.leaveWaitlist') : t('classes.cancel')}
            size="lg"
            variant="danger"
            icon="close-circle-outline"
            loading={busy}
            onPress={() => confirmCancel(session, session.bookingId!, status)}
          />
        ) : null}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 3 },
  headerCard: { gap: spacing.sm, paddingStart: spacing.xl },
  accent: { position: 'absolute', start: 0, top: 0, bottom: 0, width: 5 },
  infoLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusCard: { gap: spacing.md },
  capacity: { gap: 2 },
  section: { gap: spacing.md },
  actionBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
  },
});
