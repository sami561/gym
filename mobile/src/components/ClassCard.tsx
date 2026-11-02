import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ClassSessionDto } from '@/api/types';
import { useNow } from '@/hooks/useNow';
import { useI18n } from '@/i18n';
import { bookingTone, classAction } from '@/lib/classState';
import { formatShortDate, formatTime } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { StatusPill } from './StatusPill';

interface Props {
  session: ClassSessionDto;
  /** Booking suspended because of strikes. */
  blocked?: boolean;
  busy?: boolean;
  /** Opens the class detail (spot picker, cancellation…). */
  onOpen?: () => void;
  /** Direct booking / waitlist from the list when no spot has to be chosen. */
  onReserve?: () => void;
  /** Show the date above the time (used in "My bookings"). */
  dateLabel?: string;
}

export function ClassCard({ session, blocked = false, busy, onOpen, onReserve, dateLabel }: Props) {
  const { t, locale } = useI18n();
  const now = useNow(60_000);
  const accent = session.color || colors.red;
  const action = classAction(session, now, blocked);
  const spotsLeft = session.spotsLeft ?? Math.max(0, session.capacity - session.bookedCount);
  const fill = session.capacity > 0 ? Math.min(1, (session.capacity - spotsLeft) / session.capacity) : 0;
  const waiting = session.waitlistCount ?? 0;

  const capacityText =
    spotsLeft > 0
      ? t('classes.spotsLeft', { count: spotsLeft })
      : `${t('classes.full')}${waiting ? ` · ${t('classes.waitlistCount', { count: waiting })}` : ''}`;

  const statusLabel =
    action.kind === 'mine'
      ? `${t(`classes.status.${action.status}`, { position: session.waitlistPosition ?? '?' })}${
          action.status === 'BOOKED' && session.spotNumber ? ` · ${t('classes.spotN', { n: session.spotNumber })}` : ''
        }`
      : null;

  return (
    <Pressable
      onPress={onOpen}
      disabled={!onOpen}
      accessibilityRole="button"
      accessibilityHint={t('classes.details')}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.stripe, { backgroundColor: accent }]} />
      <View style={styles.body}>
        <View style={styles.timeCol}>
          {dateLabel ? (
            <AppText variant="caption" numberOfLines={1}>
              {dateLabel}
            </AppText>
          ) : null}
          <AppText variant="title">{formatTime(session.startsAt, locale)}</AppText>
          <AppText variant="caption">{formatTime(session.endsAt, locale)}</AppText>
        </View>
        <View style={styles.info}>
          <AppText variant="heading" numberOfLines={1}>
            {session.title}
          </AppText>
          <View style={styles.metaRow}>
            {session.coachName ? (
              <View style={styles.meta}>
                <Ionicons name="person-outline" size={13} color={colors.textMuted} />
                <AppText variant="caption" numberOfLines={1}>
                  {session.coachName}
                </AppText>
              </View>
            ) : null}
            {session.room ? (
              <View style={styles.meta}>
                <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                <AppText variant="caption" numberOfLines={1}>
                  {session.room}
                </AppText>
              </View>
            ) : null}
            {session.spotSelection ? (
              <View style={styles.meta}>
                <Ionicons name="grid-outline" size={13} color={colors.textMuted} />
                <AppText variant="caption">{t('classes.pickSpot')}</AppText>
              </View>
            ) : null}
          </View>
          <View style={styles.capacityRow}>
            <View style={styles.bar}>
              <View
                style={[styles.barFill, { width: `${fill * 100}%`, backgroundColor: spotsLeft > 0 ? accent : colors.textFaint }]}
              />
            </View>
            <AppText variant="caption">{capacityText}</AppText>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          {action.kind === 'mine' && statusLabel ? (
            <StatusPill label={statusLabel} tone={bookingTone[action.status]} />
          ) : action.kind === 'notOpen' ? (
            <AppText variant="caption">
              {t('classes.opensOn', {
                date: `${formatShortDate(action.opensAt, locale)} ${formatTime(action.opensAt, locale)}`,
              })}
            </AppText>
          ) : action.kind === 'closed' ? (
            <AppText variant="caption">{t('classes.closed')}</AppText>
          ) : action.kind === 'past' ? (
            <AppText variant="caption">{t('classes.past')}</AppText>
          ) : action.kind === 'full' ? (
            <AppText variant="caption">{t('classes.waitlistFull')}</AppText>
          ) : action.kind === 'blocked' ? (
            <AppText variant="caption" color="#FF8A8E">
              {t('classes.blockedTitle')}
            </AppText>
          ) : null}
        </View>
        {action.kind === 'book' && onReserve ? (
          <Button title={t('classes.book')} size="sm" icon="add" loading={busy} onPress={onReserve} />
        ) : action.kind === 'waitlist' && onReserve ? (
          <Button title={t('classes.joinWaitlist')} size="sm" variant="secondary" icon="hourglass-outline" loading={busy} onPress={onReserve} />
        ) : action.kind === 'chooseSpot' && onOpen ? (
          <Button title={t('classes.chooseSpot')} size="sm" icon="grid-outline" onPress={onOpen} />
        ) : action.kind === 'mine' && (action.status === 'BOOKED' || action.status === 'WAITLISTED') && onOpen ? (
          <Button title={t('classes.manage')} size="sm" variant="secondary" onPress={onOpen} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    paddingLeft: 4,
  },
  pressed: { opacity: 0.85 },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  body: { flexDirection: 'row', padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.lg },
  timeCol: { width: 64 },
  info: { flex: 1, gap: 6 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  capacityRow: { gap: 4, marginTop: 2 },
  bar: { height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.pill },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    minHeight: 44,
  },
  footerLeft: { flex: 1, paddingLeft: 80 },
});
