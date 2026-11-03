import { useCallback, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Brightness from 'expo-brightness';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import QRCode from 'react-native-qrcode-svg';
import { ApiError } from '@/api/client';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CountdownRing } from '@/components/CountdownRing';
import { MemberAvatar } from '@/components/MemberAvatar';
import { membershipKind, membershipTone } from '@/components/MembershipCard';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { StatusPill } from '@/components/StatusPill';
import { useMe } from '@/hooks/queries';
import { useAccessKey } from '@/hooks/useAccessKey';
import { useNow } from '@/hooks/useNow';
import { useI18n } from '@/i18n';
import { buildAccessCode, DEFAULT_PERIOD_SECONDS } from '@/lib/accessCode';
import { colors, radius, shadow, spacing } from '@/theme';

const QR_SIZE = 220;
const RING_SIZE = QR_SIZE + 64;
/** Large enough for the front desk to check the member's face against the pass. */
const ID_PHOTO_SIZE = 88;

/** Raise screen brightness while the pass is visible so door scanners read it reliably. */
function useMaxBrightnessWhileFocused() {
  const previous = useRef<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'web') return undefined;
      let active = true;
      (async () => {
        try {
          previous.current = await Brightness.getBrightnessAsync();
          if (active) await Brightness.setBrightnessAsync(1);
        } catch {
          // brightness control unavailable: keep the current level
        }
      })();
      return () => {
        active = false;
        if (previous.current !== null) {
          Brightness.setBrightnessAsync(previous.current).catch(() => undefined);
          previous.current = null;
        }
      };
    }, []),
  );
}

export default function PassScreen() {
  const { t } = useI18n();
  const { key, loading, offline, error, refresh } = useAccessKey();
  const me = useMe();
  const now = useNow(1000);
  useMaxBrightnessWhileFocused();

  const period = key?.period || DEFAULT_PERIOD_SECONDS;
  const step = Math.floor(now / 1000 / period);
  // Recompute the code only when the 30 s window changes.
  const code = useMemo(
    () => (key ? buildAccessCode(key.memberCode, key.secret, step * period * 1000, period) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key?.memberCode, key?.secret, step, period],
  );
  const secondsLeft = code ? Math.max(0, Math.ceil((code.expiresAt - now) / 1000)) : 0;
  const kind = me.data ? membershipKind(me.data.profile) : null;
  const member = me.data?.profile.member;

  // Pull to refresh reloads the member too: photo, name and status can change at the desk while the pass is open.
  const refreshAll = () => {
    refresh();
    me.refetch();
  };

  return (
    <Screen onRefresh={refreshAll} refreshing={false} contentStyle={styles.content}>
      <View style={styles.titles}>
        <AppText variant="display" align="center">
          {t('pass.title')}
        </AppText>
        <AppText variant="label" align="center">
          {t('pass.subtitle')}
        </AppText>
      </View>

      {loading && !key ? (
        <LoadingState />
      ) : !key ? (
        error instanceof ApiError && error.status === 404 ? (
          <EmptyState icon="qr-code-outline" message={t('pass.unavailable')} action={{ label: t('common.retry'), onPress: refresh }} />
        ) : (
          <ErrorState error={error ?? new ApiError(0, 'network', 'network')} onRetry={refresh} />
        )
      ) : code ? (
        <>
          <Animated.View entering={ZoomIn.duration(400)} style={styles.ringWrap}>
            <CountdownRing size={RING_SIZE} strokeWidth={5} expiresAt={code.expiresAt} periodMs={period * 1000}>
              <Animated.View key={code.step} entering={FadeIn.duration(280)} style={styles.qrTile}>
                <QRCode value={code.code} size={QR_SIZE - 24} color="#000000" backgroundColor="#FFFFFF" ecl="M" />
              </Animated.View>
            </CountdownRing>
          </Animated.View>

          <AppText variant="title" align="center">
            {t('pass.rotates', { seconds: secondsLeft })}
          </AppText>

          {/* Identity check at the desk: photo (initials without one), name, member code, membership status. */}
          <Card style={styles.identity}>
            {member ? <MemberAvatar member={member} size={ID_PHOTO_SIZE} shape="rounded" /> : null}
            <View style={styles.identityText}>
              {member ? (
                <AppText variant="heading" numberOfLines={2}>
                  {member.firstName} {member.lastName}
                </AppText>
              ) : null}
              <AppText variant="label">
                {t('pass.memberCode')} {key.memberCode}
              </AppText>
              {kind ? <StatusPill label={t(`membership.${kind}` as const)} tone={membershipTone[kind]} /> : null}
            </View>
          </Card>

          {offline ? (
            <View style={[styles.banner, styles.bannerInfo]}>
              <Ionicons name="cloud-offline-outline" size={18} color={colors.blue} />
              <AppText variant="label" color={colors.blue} style={styles.flex}>
                {t('pass.offline')}
              </AppText>
            </View>
          ) : null}
          {kind && kind !== 'active' ? (
            <View style={[styles.banner, styles.bannerDanger]}>
              <Ionicons name="warning-outline" size={18} color="#FF5A5F" />
              <AppText variant="label" color="#FF8A8E" style={styles.flex}>
                {t('pass.inactive')}
              </AppText>
            </View>
          ) : null}

          <View style={styles.brightness}>
            <Ionicons name="sunny-outline" size={14} color={colors.textFaint} />
            <AppText variant="caption" color={colors.textFaint}>
              {t('pass.brightness')}
            </AppText>
          </View>

          <Button title={t('pass.openInstead')} variant="secondary" icon="lock-open-outline" onPress={() => router.push('/door')} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'stretch', paddingTop: spacing.xl },
  titles: { gap: spacing.xs },
  ringWrap: { alignItems: 'center', marginTop: spacing.md },
  qrTile: {
    width: QR_SIZE,
    height: QR_SIZE,
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.md },
  identityText: { flex: 1, gap: spacing.xs },
  flex: { flex: 1 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  bannerInfo: { backgroundColor: colors.blueSoft },
  bannerDanger: { backgroundColor: colors.redSoft },
  brightness: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
});
