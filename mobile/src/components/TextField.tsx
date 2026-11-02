import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, TextInputInstance, TextInputProps, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts, radius, spacing } from '@/theme';
import { AppText } from './AppText';

interface Props extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string;
}

export const TextField = forwardRef<TextInputInstance, Props>(function TextField(
  { label, error, hint, secureTextEntry, style, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secureTextEntry);

  return (
    <View style={styles.wrapper}>
      <AppText variant="label">{label}</AppText>
      <View style={[styles.field, focused && styles.focused, !!error && styles.invalid]}>
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.red}
          cursorColor={colors.red}
          secureTextEntry={hidden}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[styles.input, style]}
          {...rest}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setHidden((v) => !v)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Afficher le mot de passe' : 'Masquer le mot de passe'}
          >
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.steel} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText variant="caption" color="#FF5A5F">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption">{hint}</AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 50,
  },
  focused: { borderColor: colors.steel },
  invalid: { borderColor: colors.red },
  input: { flex: 1, color: colors.text, fontFamily: fonts.regular, fontSize: 16, paddingVertical: spacing.md },
});
