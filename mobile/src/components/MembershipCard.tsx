import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { MemberProfile } from '@/api/types';
import { useI18n } from '@/i18n';
import { formatDate } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './AppText';
import { StatusPill, Tone } from './StatusPill';

export type MembershipKind = 'active' | 'frozen' | 'expired' | 'suspended' | 'none';

export function membershipKind(profile: MemberProfile): MembershipKind {
  if (profile.member.status === 'SUSPENDED') return 'suspended';
  if (profile.membership.active) return 'active';
  if (profile.membership.current?.status === 'FROZEN') return 'frozen';
  return profile.subscriptions.length ? 'expired' : 'none';
}

const toneByKind: Record<MembershipKind, Tone> = {
  active: 'success',
  frozen: 'info',
  expired: 'danger',
  suspended: 'danger',
  none: 'neutral',
};

function daysTone(days: number | null): string {
  if (days === null) return colors.textMuted;
  if (days <= 3) return '#FF5A5F';
  if (days <= 7) return colors.amber;
  return colors.green;
}

export function MembershipCard({ profile }: { profile: MemberProfile }) {
  const { t, locale } = useI18n();
  const { member, membership, subscriptions } = profile;
  const kind = membershipKind(profile);
  const latest = membership.current ?? subscriptions[0] ?? null;
  const planName = latest?.plan.name ?? t('membership.none');
  const statusLabel = t(`membership.${kind === 'none' ? 'none' : kind}` as const);

  return (
    <View style={styles.card} accessible accessibilityLabel={`${planName}, ${statusLabel}`}>
      <Image source={require('../../assets/images/shield-sign.jpg')} style={styles.bgImage} contentFit="cover" />
      <LinearGradient
        colors={['rgba(11,11,12,0.55)', 'rgba(11,11,12,0.92)', '#0B0B0C']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.accent} />
      <View style={styles.content}>
        <View style={styles.topRow}>
          <AppText variant="overline" color={colors.steel}>
            {t('membership.title')}
          </AppText>
          <StatusPill label={statusLabel} tone={toneByKind[kind]} />
        </View>

        <AppText variant="display" numberOfLines={1}>
          {planName}
        </AppText>

        {kind === 'active' && membership.daysLeft !== null ? (
          <View style={styles.daysRow}>
            <AppText variant="hero" color={daysTone(membership.daysLeft)}>
              {membership.daysLeft}
            </AppText>
            <AppText variant="bodyStrong" color={colors.textMuted} style={styles.daysLabel}>
              {membership.daysLeft === 1 ? t('membership.dayLeft') : t('membership.daysLeft')}
            </AppText>
          </View>
        ) : null}

        {membership.validUntil && kind === 'active' ? (
          <AppText variant="label">{t('membership.validUntil', { date: formatDate(membership.validUntil, locale) })}</AppText>
        ) : null}
        {kind === 'expired' && latest ? (
          <AppText variant="label">{t('membership.expiredOn', { date: formatDate(latest.endDate, locale) })}</AppText>
        ) : null}
        {membership.upcoming ? (
          <AppText variant="caption">
            {t('membership.upcoming', { date: formatDate(membership.upcoming.startDate, locale) })}
          </AppText>
        ) : null}
        {kind === 'expired' || kind === 'none' ? (
          <AppText variant="caption">{kind === 'none' ? t('membership.noPlanHint') : t('membership.renewHint')}</AppText>
        ) : null}

        <View style={styles.footer}>
          <View>
            <AppText variant="caption">{t('membership.member')}</AppText>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {member.firstName} {member.lastName}
            </AppText>
          </View>
          <View style={styles.codeBox}>
            <AppText variant="caption">{t('pass.memberCode')}</AppText>
            <AppText variant="bodyStrong" style={styles.code}>
              {member.memberCode}
            </AppText>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    minHeight: 230,
  },
  bgImage: { ...StyleSheet.absoluteFill, opacity: 0.9 },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.red },
  content: { padding: spacing.xl, gap: spacing.sm },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  daysRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  daysLabel: { marginBottom: 8 },
  footer: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  codeBox: { alignItems: 'flex-end' },
  code: { letterSpacing: 1 },
});
