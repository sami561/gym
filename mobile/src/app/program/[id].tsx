import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ProgramExercise } from '@/api/types';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { usePrograms } from '@/hooks/queries';
import { useDoneExercises } from '@/hooks/useDoneExercises';
import { useI18n } from '@/i18n';
import { formatNumber } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

function ExerciseRow({ exercise, done, onToggle }: { exercise: ProgramExercise; done: boolean; onToggle: () => void }) {
  const { t, locale } = useI18n();
  const details = [
    `${exercise.sets} ${t('training.sets')}`,
    `${exercise.reps} ${t('training.reps')}`,
    exercise.weightKg ? `${formatNumber(exercise.weightKg, locale)} kg` : null,
    exercise.restSeconds ? t('training.rest', { seconds: exercise.restSeconds }) : null,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={onToggle}
      style={[styles.exercise, done && styles.exerciseDone]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
    >
      <View style={[styles.check, done && styles.checkDone]}>
        {done ? <Ionicons name="checkmark" size={18} color={colors.white} /> : null}
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyStrong" style={done ? styles.strike : undefined}>
          {exercise.name}
        </AppText>
        <AppText variant="caption">{details.join(' · ')}</AppText>
        {exercise.notes ? <AppText variant="caption" color={colors.steel}>{exercise.notes}</AppText> : null}
      </View>
    </Pressable>
  );
}

function ProgressBar({ value }: { value: number }) {
  const style = useAnimatedStyle(() => ({ width: withTiming(`${Math.round(value * 100)}%`, { duration: 300 }) }));
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, style]} />
    </View>
  );
}

export default function ProgramScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const programs = usePrograms();
  const [dayIndex, setDayIndex] = useState(0);
  const program = programs.data?.find((p) => p.id === id);
  const { done, toggle, reset } = useDoneExercises(id ?? 'unknown', dayIndex);

  const day = program?.days[dayIndex];
  const total = day?.exercises.length ?? 0;
  const completed = done.filter((i) => i < total).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back} accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <AppText variant="heading" numberOfLines={1} style={styles.flex}>
          {program?.title ?? t('training.programs')}
        </AppText>
      </View>

      {programs.isPending ? (
        <LoadingState />
      ) : programs.isError ? (
        <ErrorState error={programs.error} onRetry={() => programs.refetch()} />
      ) : !program || !day ? (
        <EmptyState icon="barbell-outline" message={t('training.noProgram')} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {program.goal ? (
            <View style={styles.goal}>
              <AppText variant="overline">{t('training.goal')}</AppText>
              <AppText variant="body">{program.goal}</AppText>
            </View>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
            {program.days.map((d, index) => (
              <Pressable
                key={`${d.label}-${index}`}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => undefined);
                  setDayIndex(index);
                }}
                style={[styles.dayTab, index === dayIndex && styles.dayTabActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: index === dayIndex }}
              >
                <AppText variant="label" color={index === dayIndex ? colors.white : colors.textMuted}>
                  {d.label}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.progressRow}>
            <AppText variant="label">{t('training.done', { done: completed, total })}</AppText>
            {completed > 0 ? (
              <Button title={t('training.resetDay')} variant="ghost" size="sm" icon="refresh" onPress={reset} />
            ) : null}
          </View>
          <ProgressBar value={total ? completed / total : 0} />

          <View style={styles.list}>
            {day.exercises.map((exercise, index) => (
              <Animated.View key={`${dayIndex}-${index}`} entering={FadeInDown.delay(index * 40).duration(260)}>
                <ExerciseRow
                  exercise={exercise}
                  done={done.includes(index)}
                  onToggle={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                    toggle(index);
                    if (!done.includes(index) && completed + 1 === total) {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
                    }
                  }}
                />
              </Animated.View>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  goal: { gap: 2 },
  days: { gap: spacing.sm },
  dayTab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  dayTabActive: { backgroundColor: colors.red, borderColor: colors.red },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 38 },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceHigh, overflow: 'hidden', marginTop: -spacing.sm },
  fill: { height: '100%', backgroundColor: colors.green, borderRadius: radius.pill },
  list: { gap: spacing.sm },
  exercise: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  exerciseDone: { opacity: 0.6 },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.steel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: { backgroundColor: colors.green, borderColor: colors.green },
  strike: { textDecorationLine: 'line-through' },
});
