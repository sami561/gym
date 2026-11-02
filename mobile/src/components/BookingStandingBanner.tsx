import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useBookingPolicy, useBookingStanding } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { useI18n } from '@/i18n';
import { isBlocked } from '@/lib/classState';
import { formatDate } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './AppText';

/** Strike banner: blocking notice, or a discreet strike counter once the member has some. */
export function BookingStandingBanner() {
  const { t, locale } = useI18n();
  const standing = useBookingStanding();
  const policy = useBookingPolicy();
  const now = useNow(60_000);
  if (!standing.data) return null;

  const limit = policy.data?.noShowLimit ?? 3;
  const { strikes30d, blockedUntil } = standing.data;

  if (isBlocked(blockedUntil, now)) {
    return (
      <View style={[styles.banner, styles.blocked]} accessibilityRole="alert">
        <Ionicons name="ban-outline" size={20} color="#FF5A5F" />
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{t('classes.blockedTitle')}</AppText>
          <AppText variant="label" color="#FF8A8E">
            {t('classes.blockedBody', {
              date: formatDate(blockedUntil!, locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
            })}
          </AppText>
        </View>
      </View>
    );
  }

  if (strikes30d > 0) {
    return (
      <View style={[styles.banner, styles.warning]}>
        <Ionicons name="alert-circle-outline" size={18} color={colors.amber} />
        <AppText variant="label" color={colors.amber} style={styles.flex}>
          {t('classes.strikesInfo', { count: strikes30d, limit })}
        </AppText>
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md },
  blocked: { backgroundColor: colors.redSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.redDark },
  warning: { backgroundColor: colors.amberSoft },
  flex: { flex: 1 },
});
