import { ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { colors, spacing } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';

export function LoadingState({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <View style={styles.box}>
      <ActivityIndicator color={colors.red} size="large" />
      <AppText variant="label">{label ?? t('common.loading')}</AppText>
    </View>
  );
}

export function EmptyState({
  icon = 'sparkles-outline',
  message,
  action,
}: {
  icon?: ComponentProps<typeof Ionicons>['name'];
  message: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.box}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={26} color={colors.steel} />
      </View>
      <AppText variant="label" align="center" style={styles.message}>
        {message}
      </AppText>
      {action ? <Button title={action.label} variant="secondary" size="sm" onPress={action.onPress} /> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <View style={styles.box}>
      <View style={[styles.iconCircle, styles.errorCircle]}>
        <Ionicons name="cloud-offline-outline" size={26} color={colors.red} />
      </View>
      <AppText variant="label" align="center" style={styles.message}>
        {errorMessage(error, t)}
      </AppText>
      {onRetry ? <Button title={t('common.retry')} variant="secondary" size="sm" icon="refresh" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.md },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCircle: { backgroundColor: colors.redSoft },
  message: { maxWidth: 280 },
});
