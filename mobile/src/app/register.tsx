import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import type { Gender } from '@/api/types';
import { MembersOnlyError, useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/Button';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TextField } from '@/components/TextField';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { colors, spacing } from '@/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Form {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string;
  gender: Gender | '';
  password: string;
  confirm: string;
}

type Errors = Partial<Record<keyof Form, string>>;

function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date < new Date() && date.getFullYear() > 1900;
}

export default function RegisterScreen() {
  const { t } = useI18n();
  const { signUp } = useAuth();
  const [form, setForm] = useState<Form>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    birthDate: '',
    gender: '',
    password: '',
    confirm: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof Form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const validate = (): Errors => {
    const next: Errors = {};
    if (!form.firstName.trim()) next.firstName = t('auth.validation.required');
    if (!form.lastName.trim()) next.lastName = t('auth.validation.required');
    if (!EMAIL_RE.test(form.email.trim())) next.email = t('auth.validation.email');
    if (form.birthDate && !isValidDate(form.birthDate.trim())) next.birthDate = t('auth.validation.date');
    if (form.password.length < 8) next.password = t('auth.validation.passwordLength');
    if (form.confirm !== form.password) next.confirm = t('auth.validation.passwordMatch');
    return next;
  };

  const submit = async () => {
    const next = validate();
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      return;
    }
    setSubmitting(true);
    try {
      await signUp({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email,
        password: form.password,
        phone: form.phone.trim() || undefined,
        birthDate: form.birthDate.trim() || undefined,
        gender: form.gender || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      setFormError(error instanceof MembersOnlyError ? t('errors.membersOnly') : errorMessage(error, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label={t('auth.firstName')}
            value={form.firstName}
            onChangeText={set('firstName')}
            error={errors.firstName}
            autoComplete="given-name"
            textContentType="givenName"
          />
        </View>
        <View style={styles.flex}>
          <TextField
            label={t('auth.lastName')}
            value={form.lastName}
            onChangeText={set('lastName')}
            error={errors.lastName}
            autoComplete="family-name"
            textContentType="familyName"
          />
        </View>
      </View>
      <TextField
        label={t('auth.email')}
        value={form.email}
        onChangeText={set('email')}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <TextField
        label={`${t('auth.phone')} (${t('common.optional')})`}
        value={form.phone}
        onChangeText={set('phone')}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        placeholder="+216 …"
      />
      <TextField
        label={`${t('auth.birthDate')} (${t('common.optional')})`}
        value={form.birthDate}
        onChangeText={set('birthDate')}
        error={errors.birthDate}
        keyboardType="numbers-and-punctuation"
        placeholder="1998-04-21"
        maxLength={10}
      />
      <View style={styles.genderBox}>
        <AppText variant="label">{`${t('auth.gender')} (${t('common.optional')})`}</AppText>
        <SegmentedControl<Gender | ''>
          value={form.gender}
          onChange={(value) => setForm((current) => ({ ...current, gender: value }))}
          options={[
            { value: '', label: '—' },
            { value: 'MALE', label: t('auth.male') },
            { value: 'FEMALE', label: t('auth.female') },
          ]}
        />
      </View>
      <TextField
        label={t('auth.password')}
        value={form.password}
        onChangeText={set('password')}
        error={errors.password}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        hint={t('auth.validation.passwordLength')}
      />
      <TextField
        label={t('auth.confirmPassword')}
        value={form.confirm}
        onChangeText={set('confirm')}
        error={errors.confirm}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
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
      <Button title={t('auth.register')} size="lg" onPress={submit} loading={submitting} />
      <View style={styles.footer}>
        <AppText variant="label">{t('auth.haveAccount')}</AppText>
        <AppText
          variant="bodyStrong"
          color={colors.red}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))}
          suppressHighlighting
        >
          {t('auth.signIn')}
        </AppText>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  genderBox: { gap: 6 },
  formError: {
    backgroundColor: colors.redSoft,
    borderRadius: 10,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.redDark,
  },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, flexWrap: 'wrap' },
});
