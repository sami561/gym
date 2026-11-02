import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { MeasurementDto, PtSessionDto } from '@/api/types';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChartPoint, LineChart } from '@/components/LineChart';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { SegmentedControl } from '@/components/SegmentedControl';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { StatusPill, Tone } from '@/components/StatusPill';
import { useMeasurements, usePrograms, usePtSessions } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { TranslationKey, useI18n } from '@/i18n';
import { formatDate, formatDateTime, formatMoney, formatNumber, formatShortDate, formatTime } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';

type Tab = 'programs' | 'progress' | 'coaching';
type Metric = 'weightKg' | 'bodyFatPct' | 'waistCm';

const METRIC_UNITS: Record<Metric, string> = { weightKg: 'kg', bodyFatPct: '%', waistCm: 'cm' };
const METRIC_LABELS: Record<Metric, TranslationKey> = {
  weightKg: 'training.weight',
  bodyFatPct: 'training.bodyFat',
  waistCm: 'training.waist',
};

function bmiInfo(bmi: number): { key: TranslationKey; tone: Tone } {
  if (bmi < 18.5) return { key: 'training.bmiLabels.under', tone: 'warning' };
  if (bmi < 25) return { key: 'training.bmiLabels.normal', tone: 'success' };
  if (bmi < 30) return { key: 'training.bmiLabels.over', tone: 'warning' };
  return { key: 'training.bmiLabels.obese', tone: 'danger' };
}

function ProgramsTab() {
  const { t, locale } = useI18n();
  const programs = usePrograms();

  if (programs.isPending) return <LoadingState />;
  if (programs.isError) return <ErrorState error={programs.error} onRetry={() => programs.refetch()} />;
  const active = (programs.data ?? []).filter((p) => p.isActive);
  if (!active.length) return <EmptyState icon="barbell-outline" message={t('training.noProgram')} />;

  return (
    <View style={styles.list}>
      {active.map((program, index) => (
        <Animated.View key={program.id} entering={FadeInDown.delay(index * 60).duration(300)}>
          <Pressable
            onPress={() => router.push({ pathname: '/program/[id]', params: { id: program.id } })}
            accessibilityRole="button"
            style={({ pressed }) => [styles.programCard, pressed && styles.pressed]}
          >
            <View style={styles.programHeader}>
              <View style={styles.programIcon}>
                <Ionicons name="barbell" size={22} color={colors.red} />
              </View>
              <View style={styles.flex}>
                <AppText variant="heading" numberOfLines={2}>
                  {program.title}
                </AppText>
                <AppText variant="caption">
                  {[program.coachName ? t('training.byCoach', { name: program.coachName }) : null, t('training.weeks', { count: program.weeks })]
                    .filter(Boolean)
                    .join(' · ')}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </View>
            {program.goal ? (
              <View style={styles.goal}>
                <AppText variant="overline">{t('training.goal')}</AppText>
                <AppText variant="body">{program.goal}</AppText>
              </View>
            ) : null}
            <View style={styles.dayChips}>
              {program.days.map((day) => (
                <View key={day.label} style={styles.dayChip}>
                  <AppText variant="caption" color={colors.text}>
                    {day.label}
                  </AppText>
                  <AppText variant="caption">{day.exercises.length}</AppText>
                </View>
              ))}
            </View>
            <AppText variant="caption">{t('training.since', { date: formatDate(program.startDate, locale) })}</AppText>
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

function StatTile({ label, value, detail }: { label: string; value: string; detail?: React.ReactNode }) {
  return (
    <View style={styles.tile}>
      <AppText variant="caption">{label}</AppText>
      <AppText style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
      {detail}
    </View>
  );
}

function ProgressTab() {
  const { t, locale } = useI18n();
  const measurements = useMeasurements();
  const [metric, setMetric] = useState<Metric>('weightKg');

  const sorted = useMemo(
    () => [...(measurements.data ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
    [measurements.data],
  );
  const series: ChartPoint[] = useMemo(
    () =>
      sorted
        .filter((m) => m[metric] !== null && m[metric] !== undefined)
        .map((m) => ({ date: m.date, value: m[metric] as number })),
    [sorted, metric],
  );
  const available = (['weightKg', 'bodyFatPct', 'waistCm'] as Metric[]).filter((key) =>
    sorted.some((m) => m[key] !== null && m[key] !== undefined),
  );

  if (measurements.isPending) return <LoadingState />;
  if (measurements.isError) return <ErrorState error={measurements.error} onRetry={() => measurements.refetch()} />;

  const addButton = <Button title={t('training.addWeighIn')} icon="add-circle-outline" onPress={() => router.push('/add-measurement')} />;

  if (!sorted.length) {
    return (
      <View style={styles.list}>
        <EmptyState icon="analytics-outline" message={t('training.noMeasurements')} />
        {addButton}
      </View>
    );
  }

  const latest = sorted[sorted.length - 1];
  const weights = sorted.filter((m) => m.weightKg !== null);
  const firstWeight = weights[0]?.weightKg ?? null;
  const lastWeight = weights[weights.length - 1]?.weightKg ?? null;
  const delta = firstWeight !== null && lastWeight !== null && weights.length > 1 ? lastWeight - firstWeight : null;
  const latestBmi = [...sorted].reverse().find((m) => m.bmi !== null)?.bmi ?? null;
  const unit = METRIC_UNITS[metric];
  const format = (value: number) => `${formatNumber(value, locale)} ${unit}`;

  return (
    <View style={styles.list}>
      <View style={styles.tiles}>
        <StatTile
          label={t('training.weight')}
          value={lastWeight !== null ? `${formatNumber(lastWeight, locale)} kg` : '—'}
          detail={
            delta !== null ? (
              <View style={styles.delta}>
                <Ionicons name={delta > 0 ? 'arrow-up' : delta < 0 ? 'arrow-down' : 'remove'} size={12} color={colors.textMuted} />
                <AppText variant="caption">
                  {`${delta > 0 ? '+' : ''}${formatNumber(delta, locale)} kg · ${t('training.change')}`}
                </AppText>
              </View>
            ) : null
          }
        />
        <StatTile
          label={t('training.bmi')}
          value={latestBmi !== null ? formatNumber(latestBmi, locale) : '—'}
          detail={latestBmi !== null ? <StatusPill label={t(bmiInfo(latestBmi).key)} tone={bmiInfo(latestBmi).tone} /> : null}
        />
      </View>

      <Card>
        <View style={styles.chartHeader}>
          <AppText variant="heading">{t(METRIC_LABELS[metric])}</AppText>
          <AppText variant="caption">
            {t('training.latest')} · {formatShortDate(latest.date, locale)}
          </AppText>
        </View>
        {available.length > 1 ? (
          <View style={styles.metricChips}>
            {available.map((key) => (
              <Pressable
                key={key}
                onPress={() => setMetric(key)}
                style={[styles.metricChip, metric === key && styles.metricChipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: metric === key }}
              >
                <AppText variant="caption" color={metric === key ? colors.text : colors.textMuted}>
                  {t(METRIC_LABELS[key])}
                </AppText>
              </Pressable>
            ))}
          </View>
        ) : null}
        {series.length ? (
          <LineChart
            points={series}
            locale={locale}
            formatValue={format}
            accessibilityLabel={`${t(METRIC_LABELS[metric])}: ${series.map((p) => `${formatShortDate(p.date, locale)} ${format(p.value)}`).join(', ')}`}
          />
        ) : (
          <EmptyState icon="analytics-outline" message={t('training.noMeasurements')} />
        )}
      </Card>

      {addButton}

      <SectionHeader title={t('training.history')} />
      <Card padded={false}>
        {[...sorted].reverse().map((m: MeasurementDto, index) => (
          <View key={m.id} style={[styles.historyRow, index > 0 && styles.rowBorder]}>
            <AppText variant="bodyStrong" style={styles.historyDate}>
              {formatShortDate(m.date, locale)}
            </AppText>
            <View style={styles.historyValues}>
              <AppText variant="label" style={styles.num}>
                {m.weightKg !== null ? `${formatNumber(m.weightKg, locale)} kg` : '—'}
              </AppText>
              <AppText variant="label" style={styles.num}>
                {m.bodyFatPct !== null ? `${formatNumber(m.bodyFatPct, locale)} %` : '—'}
              </AppText>
              <AppText variant="label" style={styles.num}>
                {m.waistCm !== null ? `${formatNumber(m.waistCm, locale)} cm` : '—'}
              </AppText>
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
}

const ptTone: Record<PtSessionDto['status'], Tone> = {
  SCHEDULED: 'info',
  DONE: 'success',
  CANCELLED: 'neutral',
  NO_SHOW: 'danger',
};

function PtRow({ session }: { session: PtSessionDto }) {
  const { t, locale } = useI18n();
  return (
    <Card style={styles.ptCard}>
      <View style={styles.ptRow}>
        <View style={styles.ptDate}>
          <AppText variant="title">{formatTime(session.startsAt, locale)}</AppText>
          <AppText variant="caption">{formatShortDate(session.startsAt, locale)}</AppText>
        </View>
        <View style={styles.flex}>
          <AppText variant="heading">{t('classes.coach', { name: session.coachName })}</AppText>
          <AppText variant="caption">
            {formatDateTime(session.startsAt, locale)} – {formatTime(session.endsAt, locale)}
          </AppText>
          {session.notes ? (
            <AppText variant="caption" numberOfLines={2}>
              {session.notes}
            </AppText>
          ) : null}
        </View>
        <View style={styles.ptSide}>
          <StatusPill label={t(`training.ptStatus.${session.status}` as TranslationKey)} tone={ptTone[session.status]} />
          {session.price > 0 ? <AppText variant="caption">{formatMoney(session.price, locale)}</AppText> : null}
        </View>
      </View>
    </Card>
  );
}

function CoachingTab() {
  const { t } = useI18n();
  const sessions = usePtSessions();
  const now = useNow(60_000);
  if (sessions.isPending) return <LoadingState />;
  if (sessions.isError) return <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />;
  const all = sessions.data ?? [];
  if (!all.length) return <EmptyState icon="people-outline" message={t('training.noPt')} />;
  const upcoming = all
    .filter((s) => new Date(s.endsAt).getTime() >= now && s.status === 'SCHEDULED')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = all
    .filter((s) => !upcoming.includes(s))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  return (
    <View style={styles.list}>
      {upcoming.length ? <SectionHeader title={t('training.upcomingPt')} /> : null}
      {upcoming.map((s) => (
        <PtRow key={s.id} session={s} />
      ))}
      {past.length ? <SectionHeader title={t('training.pastPt')} /> : null}
      {past.map((s) => (
        <PtRow key={s.id} session={s} />
      ))}
    </View>
  );
}

export default function TrainingScreen() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('programs');
  const programs = usePrograms();
  const measurements = useMeasurements();
  const pt = usePtSessions();

  const refresh = () => {
    if (tab === 'programs') programs.refetch();
    else if (tab === 'progress') measurements.refetch();
    else pt.refetch();
  };

  return (
    <Screen onRefresh={refresh} refreshing={programs.isRefetching || measurements.isRefetching || pt.isRefetching}>
      <AppText variant="display">{t('training.title')}</AppText>
      <SegmentedControl<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'programs', label: t('training.programs') },
          { value: 'progress', label: t('training.progress') },
          { value: 'coaching', label: t('training.coaching') },
        ]}
      />
      <Animated.View key={tab} entering={FadeInDown.duration(250)}>
        {tab === 'programs' ? <ProgramsTab /> : tab === 'progress' ? <ProgressTab /> : <CoachingTab />}
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  programCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  programHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  programIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goal: { gap: 2 },
  dayChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dayChip: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  tiles: { flexDirection: 'row', gap: spacing.md },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 4,
  },
  tileValue: { fontFamily: fonts.semibold, fontSize: 28, lineHeight: 34, color: colors.text },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chartHeader: { gap: 2, marginBottom: spacing.md },
  metricChips: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  metricChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  metricChipActive: { backgroundColor: colors.surfaceHigh, borderColor: colors.steel },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  historyDate: { width: 72 },
  historyValues: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  num: { fontVariant: ['tabular-nums'], minWidth: 64, textAlign: 'right' },
  ptCard: { padding: spacing.md },
  ptRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  ptDate: { width: 60 },
  ptSide: { alignItems: 'flex-end', gap: 4 },
});
