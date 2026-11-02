import { ComponentProps, useCallback, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Logo } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { SegmentedControl } from '@/components/SegmentedControl';
import { ErrorState, LoadingState } from '@/components/States';
import { useGymInfo, useMe } from '@/hooks/queries';
import { getPushStatus, PushStatus } from '@/hooks/usePushRegistration';
import { Lang, useI18n } from '@/i18n';
import { formatDate, initials } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function InfoRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={colors.steel} />
      <View style={styles.flex}>
        <AppText variant="caption">{label}</AppText>
        <AppText variant="body">{value}</AppText>
      </View>
    </View>
  );
}

function MenuRow({ icon, label, onPress, right }: { icon: IconName; label: string; onPress?: () => void; right?: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]} accessibilityRole="button">
      <Ionicons name={icon} size={20} color={colors.text} />
      <AppText variant="body" style={styles.flex}>
        {label}
      </AppText>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textFaint} /> : null)}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { t, locale, lang, setLang } = useI18n();
  const { signOut } = useAuth();
  const me = useMe();
  const gym = useGymInfo();
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);

  useFocusEffect(
    useCallback(() => {
      getPushStatus().then(setPushStatus);
    }, []),
  );

  const confirmLogout = () =>
    Alert.alert(t('profile.logout'), t('profile.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.logout'), style: 'destructive', onPress: () => signOut() },
    ]);

  const member = me.data?.profile.member;
  const notProvided = t('profile.notProvided');

  return (
    <Screen onRefresh={() => me.refetch()} refreshing={me.isRefetching}>
      {me.isPending ? (
        <LoadingState />
      ) : me.isError || !member ? (
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      ) : (
        <>
          <Animated.View entering={FadeInDown.duration(350)} style={styles.identity}>
            <View style={styles.avatar}>
              <AppText variant="display">{initials(member.firstName, member.lastName)}</AppText>
            </View>
            <View style={styles.flex}>
              <AppText variant="title" numberOfLines={1}>
                {member.firstName} {member.lastName}
              </AppText>
              <AppText variant="label">{member.memberCode}</AppText>
              <AppText variant="caption">{t('profile.memberSince', { date: formatDate(member.joinedAt, locale) })}</AppText>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80).duration(350)} style={styles.section}>
            <SectionHeader title={t('profile.personalInfo')} action={{ label: t('profile.edit'), onPress: () => router.push('/edit-profile') }} />
            <Card style={styles.infoCard}>
              <InfoRow icon="mail-outline" label={t('profile.email')} value={member.email} />
              <InfoRow icon="call-outline" label={t('profile.phone')} value={member.phone ?? notProvided} />
              <InfoRow
                icon="gift-outline"
                label={t('profile.birthDate')}
                value={member.birthDate ? formatDate(member.birthDate, locale) : notProvided}
              />
              <InfoRow icon="medkit-outline" label={t('profile.emergencyContact')} value={member.emergencyContact ?? notProvided} />
            </Card>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(140).duration(350)}>
            <Card padded={false}>
              <MenuRow icon="time-outline" label={t('history.title')} onPress={() => router.push('/history')} />
              <View style={styles.divider} />
              <MenuRow icon="key-outline" label={t('profile.changePassword')} onPress={() => router.push('/change-password')} />
              <View style={styles.divider} />
              <MenuRow
                icon="notifications-outline"
                label={t('profile.notifications')}
                right={
                  <AppText variant="label">
                    {pushStatus === 'granted' ? t('profile.notificationsOn') : t('profile.notificationsOff')}
                  </AppText>
                }
                onPress={pushStatus === 'denied' ? () => Linking.openSettings() : undefined}
              />
              <View style={styles.divider} />
              <View style={styles.langRow}>
                <Ionicons name="language-outline" size={20} color={colors.text} />
                <AppText variant="body" style={styles.flex}>
                  {t('profile.language')}
                </AppText>
                <View style={styles.langControl}>
                  <SegmentedControl<Lang>
                    value={lang}
                    onChange={setLang}
                    options={[
                      { value: 'fr', label: 'FR' },
                      { value: 'en', label: 'EN' },
                    ]}
                  />
                </View>
              </View>
            </Card>
          </Animated.View>
        </>
      )}

      {gym.data ? (
        <Animated.View entering={FadeInDown.delay(200).duration(350)} style={styles.section}>
          <SectionHeader title={t('profile.gym')} />
          <Card style={styles.gymCard}>
            <View style={styles.gymHeader}>
              <Logo size={48} />
              <View style={styles.flex}>
                <AppText variant="heading">{gym.data.name}</AppText>
                <AppText variant="caption">
                  {gym.data.address}, {gym.data.city}
                </AppText>
              </View>
            </View>
            <View style={styles.hours}>
              <AppText variant="overline">{t('profile.hours')}</AppText>
              {gym.data.openingHours.map((slot) => (
                <View key={slot.days} style={styles.hoursRow}>
                  <AppText variant="label">{slot.days}</AppText>
                  <AppText variant="bodyStrong">
                    {slot.open} – {slot.close}
                  </AppText>
                </View>
              ))}
            </View>
            <View style={styles.gymActions}>
              <Button
                title={t('profile.directions')}
                variant="secondary"
                size="sm"
                icon="navigate-outline"
                style={styles.flex}
                onPress={() => Linking.openURL(gym.data.mapsUrl)}
              />
              <Button
                title={t('profile.call')}
                variant="secondary"
                size="sm"
                icon="call-outline"
                style={styles.flex}
                onPress={() => Linking.openURL(`tel:${gym.data.phone.replace(/\s/g, '')}`)}
              />
              <Button
                title={t('profile.instagram')}
                variant="secondary"
                size="sm"
                icon="logo-instagram"
                style={styles.flex}
                onPress={() => Linking.openURL(gym.data.instagram)}
              />
            </View>
          </Card>
        </Animated.View>
      ) : null}

      <Button title={t('profile.logout')} variant="danger" icon="log-out-outline" onPress={confirmLogout} />
      <AppText variant="caption" align="center" color={colors.textFaint}>
        {t('profile.version', { version: Constants.expoConfig?.version ?? '1.0.0' })}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.sm },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { gap: spacing.md },
  infoCard: { gap: spacing.lg },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 56 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.lg + 32 },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 64 },
  langControl: { width: 120 },
  gymCard: { gap: spacing.lg },
  gymHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  hours: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between' },
  gymActions: { flexDirection: 'row', gap: spacing.sm },
});
