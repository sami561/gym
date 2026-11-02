import { useState } from 'react';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ModalScreen } from '@/components/ModalScreen';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useAddMeasurement } from '@/hooks/queries';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/errors';

/** Accepts "72,5" as well as "72.5". */
function parseDecimal(raw: string): number | null | 'invalid' {
  const value = raw.trim().replace(',', '.');
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 'invalid';
}

export default function AddMeasurementScreen() {
  const { t } = useI18n();
  const toast = useToast();
  const add = useAddMeasurement();
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [waist, setWaist] = useState('');
  const [errors, setErrors] = useState<{ weight?: string; bodyFat?: string; waist?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    const weightKg = parseDecimal(weight);
    const bodyFatPct = parseDecimal(bodyFat);
    const waistCm = parseDecimal(waist);
    const next: typeof errors = {};
    if (weightKg === null) next.weight = t('auth.validation.required');
    else if (weightKg === 'invalid' || weightKg > 400) next.weight = t('training.invalidNumber');
    if (bodyFatPct === 'invalid' || (typeof bodyFatPct === 'number' && bodyFatPct >= 80)) next.bodyFat = t('training.invalidNumber');
    if (waistCm === 'invalid' || (typeof waistCm === 'number' && waistCm > 300)) next.waist = t('training.invalidNumber');
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;

    try {
      await add.mutateAsync({
        weightKg: weightKg as number,
        bodyFatPct: typeof bodyFatPct === 'number' ? bodyFatPct : undefined,
        waistCm: typeof waistCm === 'number' ? waistCm : undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      toast(t('training.saved'));
      router.back();
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  };

  return (
    <ModalScreen title={t('training.addWeighIn')}>
      <TextField
        label={t('training.weightKg')}
        value={weight}
        onChangeText={setWeight}
        error={errors.weight}
        keyboardType="decimal-pad"
        placeholder="72,5"
        autoFocus
      />
      <TextField
        label={`${t('training.bodyFatPct')} (${t('common.optional')})`}
        value={bodyFat}
        onChangeText={setBodyFat}
        error={errors.bodyFat}
        keyboardType="decimal-pad"
        placeholder="18"
      />
      <TextField
        label={`${t('training.waistCm')} (${t('common.optional')})`}
        value={waist}
        onChangeText={setWaist}
        error={errors.waist}
        keyboardType="decimal-pad"
        placeholder="82"
      />
      {formError ? (
        <AppText variant="label" color="#FF8A8E">
          {formError}
        </AppText>
      ) : null}
      <Button title={t('common.save')} size="lg" loading={add.isPending} onPress={submit} />
    </ModalScreen>
  );
}
