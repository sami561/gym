import { useState } from 'react';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ModalScreen } from '@/components/ModalScreen';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/errors';

export default function ChangePasswordScreen() {
  const { t } = useI18n();
  const toast = useToast();
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const found: Record<string, string> = {};
    if (!current) found.current = t('auth.validation.required');
    if (next.length < 8) found.next = t('auth.validation.passwordLength');
    if (confirm !== next) found.confirm = t('auth.validation.passwordMatch');
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      // Other devices are signed out; this one stores the fresh session and stays signed in.
      await changePassword(current, next);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      toast(t('profile.passwordChanged'));
      router.back();
    } catch (error) {
      setFormError(errorMessage(error, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalScreen title={t('profile.changePassword')}>
      <TextField
        label={t('profile.currentPassword')}
        value={current}
        onChangeText={setCurrent}
        error={errors.current}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
      />
      <TextField
        label={t('profile.newPassword')}
        value={next}
        onChangeText={setNext}
        error={errors.next}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        hint={t('auth.validation.passwordLength')}
      />
      <TextField
        label={t('auth.confirmPassword')}
        value={confirm}
        onChangeText={setConfirm}
        error={errors.confirm}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      {formError ? (
        <AppText variant="label" color="#FF8A8E">
          {formError}
        </AppText>
      ) : null}
      <Button title={t('common.save')} size="lg" loading={saving} onPress={submit} />
    </ModalScreen>
  );
}
