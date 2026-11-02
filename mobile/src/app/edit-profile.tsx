import { useState } from 'react';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import type { MemberDto } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ModalScreen } from '@/components/ModalScreen';
import { ErrorState, LoadingState } from '@/components/States';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useMe, useUpdateMe } from '@/hooks/queries';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/errors';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function EditProfileForm({ member }: { member: MemberDto }) {
  const { t } = useI18n();
  const toast = useToast();
  const { updateUser } = useAuth();
  const update = useUpdateMe();
  const [firstName, setFirstName] = useState(member.firstName);
  const [lastName, setLastName] = useState(member.lastName);
  const [phone, setPhone] = useState(member.phone ?? '');
  const [birthDate, setBirthDate] = useState(member.birthDate ?? '');
  const [emergencyContact, setEmergencyContact] = useState(member.emergencyContact ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = t('auth.validation.required');
    if (!lastName.trim()) next.lastName = t('auth.validation.required');
    if (birthDate.trim() && !DATE_RE.test(birthDate.trim())) next.birthDate = t('auth.validation.date');
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;

    try {
      const saved = await update.mutateAsync({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || null,
        birthDate: birthDate.trim() || null,
        emergencyContact: emergencyContact.trim() || null,
      });
      updateUser({ firstName: saved.firstName, lastName: saved.lastName, phone: saved.phone });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      toast(t('profile.saved'));
      router.back();
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  };

  return (
    <>
      <TextField label={t('auth.firstName')} value={firstName} onChangeText={setFirstName} error={errors.firstName} />
      <TextField label={t('auth.lastName')} value={lastName} onChangeText={setLastName} error={errors.lastName} />
      <TextField label={t('auth.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+216 …" />
      <TextField
        label={t('auth.birthDate')}
        value={birthDate}
        onChangeText={setBirthDate}
        error={errors.birthDate}
        keyboardType="numbers-and-punctuation"
        placeholder="1998-04-21"
        maxLength={10}
      />
      <TextField
        label={t('profile.emergencyContact')}
        value={emergencyContact}
        onChangeText={setEmergencyContact}
        placeholder={t('profile.emergencyPlaceholder')}
      />
      {formError ? (
        <AppText variant="label" color="#FF8A8E">
          {formError}
        </AppText>
      ) : null}
      <Button title={t('common.save')} size="lg" loading={update.isPending} onPress={submit} />
    </>
  );
}

export default function EditProfileScreen() {
  const { t } = useI18n();
  const me = useMe();
  const member = me.data?.profile.member;

  return (
    <ModalScreen title={t('profile.edit')}>
      {member ? (
        <EditProfileForm member={member} />
      ) : me.isError ? (
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      ) : (
        <LoadingState />
      )}
    </ModalScreen>
  );
}
