import { StyleSheet, Text, TextProps } from 'react-native';
import { colors, fonts } from '@/theme';

type Variant = 'hero' | 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'label' | 'caption' | 'overline';

interface Props extends TextProps {
  variant?: Variant;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

export function AppText({ variant = 'body', color, align, style, ...rest }: Props) {
  return (
    <Text
      {...rest}
      style={[styles[variant], color ? { color } : null, align ? { textAlign: align } : null, style]}
    />
  );
}

const styles = StyleSheet.create({
  hero: { fontFamily: fonts.display, fontSize: 56, lineHeight: 56, color: colors.text, letterSpacing: 1 },
  display: { fontFamily: fonts.display, fontSize: 38, lineHeight: 40, color: colors.text, letterSpacing: 0.8 },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.text, letterSpacing: 0.6 },
  heading: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.text },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21, color: colors.text },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.textMuted },
  overline: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 14,
    color: colors.textMuted,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
});
