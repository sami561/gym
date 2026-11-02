import { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { colors, fonts, radius, spacing } from '@/theme';
import { AppText } from './AppText';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'light';
type Size = 'md' | 'lg' | 'sm';

interface Props {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: ComponentProps<typeof Ionicons>['name'];
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  right?: ReactNode;
  accessibilityHint?: string;
}

const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.red, fg: colors.white, border: colors.red },
  secondary: { bg: colors.surfaceAlt, fg: colors.text, border: colors.border },
  ghost: { bg: 'transparent', fg: colors.text, border: 'transparent' },
  danger: { bg: 'transparent', fg: colors.red, border: colors.redDark },
  light: { bg: colors.white, fg: colors.black, border: colors.white },
};

const heights: Record<Size, number> = { sm: 38, md: 50, lg: 60 };

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  disabled,
  style,
  right,
  accessibilityHint,
}: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const { bg, fg, border } = palette[variant];
  const inactive = disabled || loading;

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!inactive, busy: !!loading }}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        disabled={inactive}
        onPressIn={() => {
          scale.set(withSpring(0.97, { damping: 20, stiffness: 400 }));
        }}
        onPressOut={() => {
          scale.set(withSpring(1, { damping: 16, stiffness: 300 }));
        }}
        style={[
          styles.base,
          { backgroundColor: bg, borderColor: border, height: heights[size], opacity: disabled ? 0.45 : 1 },
          size === 'sm' && styles.small,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : (
          <View style={styles.row}>
            {icon ? <Ionicons name={icon} size={size === 'lg' ? 22 : 18} color={fg} /> : null}
            <AppText
              style={[styles.label, size === 'lg' && styles.labelLarge, size === 'sm' && styles.labelSmall, { color: fg }]}
              numberOfLines={1}
            >
              {title}
            </AppText>
            {right}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  small: { borderRadius: radius.sm, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { fontFamily: fonts.semibold, fontSize: 15 },
  labelLarge: { fontFamily: fonts.display, fontSize: 24, letterSpacing: 1.2, lineHeight: 28 },
  labelSmall: { fontSize: 13 },
});
