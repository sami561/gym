import { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { ClassCard } from '@/components/ClassCard';
import { Logo } from '@/components/Logo';
import { MembershipCard } from '@/components/MembershipCard';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { ErrorState, LoadingState } from '@/components/States';
import { useBookings, useMe } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { useI18n } from '@/i18n';
import { formatDate, formatShortDate, formatWeekday, isSameDay } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

function Stat({ icon, value, label }: { icon: ComponentProps<typeof Ionicons>['name']; value: string; label: string }) {
  return (
    <Pressable style={styles.stat} onPress={() => router.push('/history')} accessibilityRole="button">
      <Ionicons name={icon} size={18} color={colors.steel} />
      <AppText variant="title" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
      <AppText variant="caption" numberOfLines={2}>
        {label}
      </AppText>
    </Pressable>
  );
}

export default function HomeScreen() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const me = useMe();
  const bookings = useBookings();
  const now = useNow(60_000);

  const firstName = me.data?.profile.member.firstName ?? user?.firstName ?? '';
  const nextBooking = (bookings.data ?? [])
    .filter((b) => b.status === 'BOOKED' && b.session && new Date(b.session.endsAt).getTime() > now)
    .sort((a, b) => (a.session!.startsAt < b.session!.startsAt ? -1 : 1))[0];

  const refresh = () => {
    me.refetch();
    bookings.refetch();
  };

  const access = me.data?.access;
  const lastVisit = access?.lastVisitAt ? formatShortDate(access.lastVisitAt, locale) : t('home.never');

  const nextLabel = (() => {
    if (!nextBooking?.session) return undefined;
    const start = new Date(nextBooking.session.startsAt);
    if (isSameDay(start, new Date())) return t('common.today');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (isSameDay(start, tomorrow)) return t('common.tomorrow');
    return `${formatWeekday(start, locale)} ${formatShortDate(start, locale)}`;
  })();

  return (
    <Screen refreshing={me.isRefetching} onRefresh={refresh}>
      <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
        <View style={styles.headerText}>
          <AppText variant="label">{formatDate(new Date(), locale, { weekday: 'long', day: 'numeric', month: 'long' })}</AppText>
          <AppText variant="display" numberOfLines={1}>
            {t('home.greeting', { name: firstName })}
          </AppText>
          <AppText variant="label">{t('home.subtitle')}</AppText>
        </View>
        <Logo size={52} />
      </Animated.View>

      {me.isPending ? (
        <LoadingState />
      ) : me.isError && !me.data ? (
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      ) : me.data ? (
        <>
          <Animated.View entering={FadeInDown.delay(80).duration(450)}>
            <MembershipCard profile={me.data.profile} />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(160).duration(450)}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('home.openDoor')}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
                router.push('/door');
              }}
              style={({ pressed }) => [styles.doorButton, pressed && styles.pressed]}
            >
              <LinearGradient
                colors={[colors.red, colors.redDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.doorIcon}>
                <Ionicons name="lock-open" size={26} color={colors.white} />
              </View>
              <View style={styles.flex}>
                <AppText variant="title">{t('home.openDoor')}</AppText>
                <AppText variant="caption" color="rgba(255,255,255,0.8)">
                  {t('home.openDoorHint')}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.white} />
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(220).duration(450)} style={styles.quickRow}>
            <Pressable style={styles.quick} onPress={() => router.push('/pass')} accessibilityRole="button">
              <Ionicons name="qr-code-outline" size={22} color={colors.text} />
              <AppText variant="bodyStrong">{t('home.myPass')}</AppText>
            </Pressable>
            <Pressable style={styles.quick} onPress={() => router.push('/classes')} accessibilityRole="button">
              <Ionicons name="calendar-outline" size={22} color={colors.text} />
              <AppText variant="bodyStrong">{t('home.bookClass')}</AppText>
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(280).duration(450)} style={styles.statsRow}>
            <Stat icon="flame-outline" value={String(access?.visitsThisMonth ?? 0)} label={t('home.visitsThisMonth')} />
            <Stat icon="trophy-outline" value={String(access?.totalVisits ?? 0)} label={t('home.totalVisits')} />
            <Stat icon="time-outline" value={lastVisit} label={t('home.lastVisit')} />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(340).duration(450)} style={styles.section}>
            <SectionHeader title={t('home.nextClass')} action={{ label: t('home.browseClasses'), onPress: () => router.push('/classes') }} />
            {nextBooking?.session ? (
              <ClassCard
                session={{
                  ...nextBooking.session,
                  bookingId: nextBooking.id,
                  bookingStatus: nextBooking.status,
                  spotNumber: nextBooking.spotNumber,
                  waitlistPosition: nextBooking.waitlistPosition,
                }}
                dateLabel={nextLabel}
                onOpen={() => router.push({ pathname: '/class/[id]', params: { id: nextBooking.sessionId } })}
              />
            ) : (
              <Card style={styles.emptyCard}>
                <Ionicons name="calendar-clear-outline" size={20} color={colors.steel} />
                <AppText variant="label">{t('home.noNextClass')}</AppText>
              </Card>
            )}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(400).duration(450)}>
            <Pressable style={styles.trainingCard} onPress={() => router.push('/training')} accessibilityRole="button">
              <View style={styles.trainingIcon}>
                <Ionicons name="barbell" size={22} color={colors.red} />
              </View>
              <View style={styles.flex}>
                <AppText variant="heading">{t('home.myTraining')}</AppText>
                <AppText variant="caption">{t('home.myTrainingHint')}</AppText>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
          </Animated.View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerText: { flex: 1, gap: 2 },
  flex: { flex: 1 },
  doorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    minHeight: 88,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  doorIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickRow: { flexDirection: 'row', gap: spacing.md },
  quick: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  statsRow: { flexDirection: 'row', gap: spacing.md },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
  section: { gap: spacing.md },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trainingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  trainingIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
