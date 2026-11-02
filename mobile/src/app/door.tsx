import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useQueryClient } from '@tanstack/react-query';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  ZoomIn,
  cancelAnimation,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { meApi } from '@/api/endpoints';
import type { AccessDecision } from '@/api/types';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { queryKeys, useDoors } from '@/hooks/queries';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { colors, fonts, radius, spacing } from '@/theme';

type Phase =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'opening' }
  | { kind: 'result'; decision: AccessDecision }
  | { kind: 'permission'; canAskAgain: boolean }
  | { kind: 'error'; message: string };

const OPEN_BUTTON = 168;

async function currentPosition(): Promise<Location.LocationObject | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000));
  const precise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
  const position = await Promise.race([precise, timeout]);
  return position ?? Location.getLastKnownPositionAsync({ maxAge: 60_000 }).catch(() => null);
}

function PulseHalo({ active }: { active: boolean }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (active && !reduceMotion) {
      progress.set(0);
      progress.set(withRepeat(withTiming(1, { duration: 1200, easing: Easing.out(Easing.quad) }), -1, false));
    } else {
      cancelAnimation(progress);
      progress.set(withTiming(0, { duration: 200 }));
    }
  }, [active, reduceMotion, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: active ? 0.55 * (1 - progress.get()) : 0,
    transform: [{ scale: 1 + progress.get() * 0.45 }],
  }));

  return <Animated.View pointerEvents="none" style={[styles.halo, style]} />;
}

export default function DoorScreen() {
  const { t } = useI18n();
  const doors = useDoors();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const doorList = doors.data ?? [];
  const doorId = selected ?? (doorList.length === 1 ? doorList[0].id : null);
  const busy = phase.kind === 'locating' || phase.kind === 'opening';

  const open = async () => {
    if (!doorId || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
    setPhase({ kind: 'locating' });
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setPhase({ kind: 'permission', canAskAgain: permission.canAskAgain });
        return;
      }
      const servicesOn = await Location.hasServicesEnabledAsync().catch(() => true);
      const position = servicesOn ? await currentPosition() : null;
      if (!position) {
        setPhase({ kind: 'error', message: t('door.locationUnavailable') });
        return;
      }
      setPhase({ kind: 'opening' });
      const decision = await meApi.openDoor(doorId, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy ?? undefined,
      });
      Haptics.notificationAsync(
        decision.granted ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
      ).catch(() => undefined);
      setPhase({ kind: 'result', decision });
      if (decision.granted) {
        queryClient.invalidateQueries({ queryKey: queryKeys.me });
        queryClient.invalidateQueries({ queryKey: queryKeys.visits });
      }
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      setPhase({ kind: 'error', message: errorMessage(error, t) });
    }
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const firstName = phase.kind === 'result' ? phase.decision.member?.fullName.split(' ')[0] ?? '' : '';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <View style={styles.grabber} />
        <Pressable onPress={close} hitSlop={12} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel={t('common.close')}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.body}>
        {phase.kind === 'result' ? (
          <View style={styles.result}>
            <Animated.View
              entering={ZoomIn.springify().damping(12)}
              style={[styles.resultIcon, { backgroundColor: phase.decision.granted ? colors.greenSoft : colors.redSoft }]}
            >
              <Ionicons
                name={phase.decision.granted ? 'lock-open' : 'close'}
                size={64}
                color={phase.decision.granted ? colors.green : '#FF5A5F'}
              />
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(150).duration(350)} style={styles.resultText}>
              <AppText variant="display" align="center">
                {phase.decision.granted ? t('door.granted') : t('door.denied')}
              </AppText>
              <AppText variant="body" align="center" color={colors.textMuted}>
                {phase.decision.granted
                  ? t('door.grantedHint', { name: firstName })
                  : phase.decision.reason ?? t('errors.generic')}
              </AppText>
              {phase.decision.door ? (
                <AppText variant="caption" align="center">
                  {phase.decision.door.name}
                </AppText>
              ) : null}
            </Animated.View>
            <Animated.View entering={FadeIn.delay(300)} style={styles.actions}>
              {phase.decision.granted ? (
                <Button title={t('door.done')} size="lg" onPress={close} />
              ) : (
                <>
                  <Button title={t('door.tryAgain')} size="lg" icon="refresh" onPress={() => setPhase({ kind: 'idle' })} />
                  <Button
                    title={t('door.usePass')}
                    variant="secondary"
                    icon="qr-code-outline"
                    onPress={() => {
                      close();
                      router.push('/pass');
                    }}
                  />
                </>
              )}
            </Animated.View>
          </View>
        ) : (
          <>
            <Animated.View entering={FadeInDown.duration(350)} style={styles.titles}>
              <AppText variant="display">{t('door.title')}</AppText>
              <AppText variant="label">{t('door.subtitle')}</AppText>
            </Animated.View>

            {doors.isPending ? (
              <LoadingState />
            ) : doors.isError ? (
              <ErrorState error={doors.error} onRetry={() => doors.refetch()} />
            ) : doorList.length === 0 ? (
              <EmptyState icon="lock-closed-outline" message={t('door.noDoors')} />
            ) : (
              <>
                {doorList.length > 1 ? (
                  <View style={styles.doorList}>
                    {doorList.map((door) => {
                      const active = door.id === doorId;
                      return (
                        <Pressable
                          key={door.id}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => undefined);
                            setSelected(door.id);
                          }}
                          style={[styles.doorItem, active && styles.doorItemActive]}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: active }}
                        >
                          <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? colors.red : colors.steel} />
                          <View style={styles.flex}>
                            <AppText variant="bodyStrong">{door.name}</AppText>
                            {door.location ? <AppText variant="caption">{door.location}</AppText> : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.singleDoor}>
                    <Ionicons name="business-outline" size={16} color={colors.steel} />
                    <AppText variant="label">
                      {doorList[0].name}
                      {doorList[0].location ? ` · ${doorList[0].location}` : ''}
                    </AppText>
                  </View>
                )}

                <View style={styles.openArea}>
                  <PulseHalo active={busy} />
                  <Pressable
                    onPress={open}
                    disabled={!doorId || busy}
                    accessibilityRole="button"
                    accessibilityLabel={t('door.open')}
                    accessibilityState={{ disabled: !doorId || busy, busy }}
                    style={({ pressed }) => [
                      styles.openButton,
                      (!doorId || busy) && styles.openButtonDisabled,
                      pressed && styles.openButtonPressed,
                    ]}
                  >
                    <Ionicons name={busy ? 'radio-outline' : 'lock-open'} size={44} color={colors.white} />
                    <AppText style={styles.openLabel}>
                      {phase.kind === 'locating' ? '…' : phase.kind === 'opening' ? t('door.opening') : t('door.open')}
                    </AppText>
                  </Pressable>
                </View>

                <View style={styles.statusArea}>
                  {phase.kind === 'locating' ? (
                    <Animated.View entering={FadeIn}>
                      <AppText variant="label" align="center">
                        {t('door.locating')}
                      </AppText>
                    </Animated.View>
                  ) : null}
                  {phase.kind === 'permission' ? (
                    <Animated.View entering={FadeIn} style={styles.notice}>
                      <AppText variant="label" align="center">
                        {t('door.locationDenied')}
                      </AppText>
                      {!phase.canAskAgain ? (
                        <Button title={t('door.openSettings')} variant="secondary" size="sm" icon="settings-outline" onPress={() => Linking.openSettings()} />
                      ) : null}
                    </Animated.View>
                  ) : null}
                  {phase.kind === 'error' ? (
                    <Animated.View entering={FadeIn} style={styles.notice}>
                      <AppText variant="label" align="center" color="#FF8A8E">
                        {phase.message}
                      </AppText>
                    </Animated.View>
                  ) : null}
                </View>
              </>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: { alignItems: 'center', paddingTop: spacing.sm, paddingHorizontal: spacing.lg, height: 48 },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.surfaceHigh },
  closeBtn: {
    position: 'absolute',
    end: spacing.lg,
    top: spacing.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, paddingHorizontal: spacing.xl, gap: spacing.xl },
  titles: { gap: spacing.xs },
  flex: { flex: 1 },
  doorList: { gap: spacing.sm },
  doorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  doorItemActive: { borderColor: colors.red, backgroundColor: colors.surfaceAlt },
  singleDoor: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  openArea: { alignItems: 'center', justifyContent: 'center', height: OPEN_BUTTON * 1.6 },
  halo: {
    position: 'absolute',
    width: OPEN_BUTTON,
    height: OPEN_BUTTON,
    borderRadius: OPEN_BUTTON / 2,
    backgroundColor: colors.red,
  },
  openButton: {
    width: OPEN_BUTTON,
    height: OPEN_BUTTON,
    borderRadius: OPEN_BUTTON / 2,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 6,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  openButtonDisabled: { backgroundColor: colors.redDark },
  openButtonPressed: { transform: [{ scale: 0.96 }] },
  openLabel: { fontFamily: fonts.display, fontSize: 26, letterSpacing: 1.5, color: colors.white },
  statusArea: { minHeight: 80, alignItems: 'center' },
  notice: { gap: spacing.md, alignItems: 'center' },
  result: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.xl },
  resultIcon: { width: 140, height: 140, borderRadius: 70, alignItems: 'center', justifyContent: 'center' },
  resultText: { gap: spacing.sm, alignItems: 'center' },
  actions: { alignSelf: 'stretch', gap: spacing.md },
});
