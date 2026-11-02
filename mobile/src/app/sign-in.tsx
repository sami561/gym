import { useRef, useState } from 'react';
import { StyleSheet, TextInputInstance, View } from 'react-native';
import { Link } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MembersOnlyError, useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { colors, spacing } from '@/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen() {
  const { t } = useI18n();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);

  const submit = async () => {
    const next: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) next.email = t('auth.validation.email');
    if (!password) next.password = t('auth.validation.required');
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      await signIn(email, password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      setFormError(error instanceof MembersOnlyError ? t('errors.membersOnly') : errorMessage(error, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title={t('auth.welcome')} subtitle={t('auth.tagline')}>
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        placeholder={t('auth.emailPlaceholder')}
      />
      <TextField
        ref={passwordRef}
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {formError ? (
        <View style={styles.formError}>
          <AppText variant="label" color="#FF8A8E">
            {formError}
          </AppText>
        </View>
      ) : null}
      <Button title={t('auth.signIn')} size="lg" onPress={submit} loading={submitting} />
      <View style={styles.footer}>
        <AppText variant="label">{t('auth.noAccount')}</AppText>
        <Link href="/register" asChild>
          <AppText variant="bodyStrong" color={colors.red} suppressHighlighting>
            {t('auth.createAccount')}
          </AppText>
        </Link>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  formError: {
    backgroundColor: colors.redSoft,
    borderRadius: 10,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.redDark,
  },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, flexWrap: 'wrap' },
});
