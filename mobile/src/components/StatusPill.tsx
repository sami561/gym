import { StyleSheet, View } from 'react-native';
import { colors, fonts, radius, spacing } from '@/theme';
import { AppText } from './AppText';

export type Tone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

const tones: Record<Tone, { bg: string; fg: string }> = {
  success: { bg: colors.greenSoft, fg: colors.green },
  danger: { bg: colors.redSoft, fg: '#FF5A5F' },
  warning: { bg: colors.amberSoft, fg: colors.amber },
  info: { bg: colors.blueSoft, fg: colors.blue },
  neutral: { bg: colors.surfaceHigh, fg: colors.textMuted },
};

export function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const { bg, fg } = tones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <View style={[styles.dot, { backgroundColor: fg }]} />
      <AppText style={[styles.text, { color: fg }]}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
});
