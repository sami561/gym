import { ComponentProps, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { AccessLogDto, PaymentDto, SubscriptionDto } from '@/api/types';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { StatusPill, Tone } from '@/components/StatusPill';
import { useMe, useVisits } from '@/hooks/queries';
import { TranslationKey, useI18n } from '@/i18n';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

type Tab = 'visits' | 'payments' | 'subscriptions';
type IconName = ComponentProps<typeof Ionicons>['name'];

const methodIcons: Record<AccessLogDto['method'], IconName> = {
  QR: 'qr-code-outline',
  APP: 'phone-portrait-outline',
  CARD: 'card-outline',
  FINGERPRINT: 'finger-print-outline',
  MANUAL: 'person-outline',
};

const subscriptionTone: Record<SubscriptionDto['status'], Tone> = {
  ACTIVE: 'success',
  FROZEN: 'info',
  EXPIRED: 'neutral',
  CANCELLED: 'danger',
};

const subscriptionLabel: Record<SubscriptionDto['status'], TranslationKey> = {
  ACTIVE: 'membership.active',
  FROZEN: 'membership.frozen',
  EXPIRED: 'membership.expired',
  CANCELLED: 'membership.cancelled',
};

function VisitRow({ log }: { log: AccessLogDto }) {
  const { t, locale } = useI18n();
  const granted = log.result === 'GRANTED';
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: granted ? colors.greenSoft : colors.redSoft }]}>
        <Ionicons name={methodIcons[log.method]} size={18} color={granted ? colors.green : '#FF5A5F'} />
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{granted ? t('history.granted') : t('history.denied')}</AppText>
        <AppText variant="caption">
          {[t(`history.methods.${log.method}` as TranslationKey), log.doorName].filter(Boolean).join(' · ')}
        </AppText>
        {!granted && log.reason ? (
          <AppText variant="caption" color="#FF8A8E">
            {log.reason}
          </AppText>
        ) : null}
      </View>
      <AppText variant="caption">{formatDateTime(log.createdAt, locale)}</AppText>
    </View>
  );
}

function PaymentRow({ payment }: { payment: PaymentDto }) {
  const { t, locale } = useI18n();
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: colors.surfaceHigh }]}>
        <Ionicons name="receipt-outline" size={18} color={colors.text} />
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{payment.planName ?? t('membership.title')}</AppText>
        <AppText variant="caption">
          {[t(`history.paymentMethods.${payment.method}` as TranslationKey), formatDate(payment.paidAt, locale)].join(' · ')}
        </AppText>
      </View>
      <AppText variant="bodyStrong" style={styles.amount}>
        {formatMoney(payment.amount, locale)}
      </AppText>
    </View>
  );
}

function SubscriptionRow({ subscription }: { subscription: SubscriptionDto }) {
  const { t, locale } = useI18n();
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: colors.redSoft }]}>
        <Ionicons name="ribbon-outline" size={18} color={colors.red} />
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{subscription.plan.name}</AppText>
        <AppText variant="caption">
          {t('history.from', {
            from: formatDate(subscription.startDate, locale),
            to: formatDate(subscription.endDate, locale),
          })}
        </AppText>
      </View>
      <View style={styles.side}>
        <StatusPill label={t(subscriptionLabel[subscription.status])} tone={subscriptionTone[subscription.status]} />
        <AppText variant="caption">{formatMoney(subscription.price, locale)}</AppText>
      </View>
    </View>
  );
}

function ListCard<T extends { id: string }>({ items, render }: { items: T[]; render: (item: T) => React.ReactNode }) {
  return (
    <Card padded={false}>
      {items.map((item, index) => (
        <Animated.View
          key={item.id}
          entering={FadeInDown.delay(Math.min(index, 12) * 30).duration(250)}
          style={index > 0 ? styles.divider : undefined}
        >
          {render(item)}
        </Animated.View>
      ))}
    </Card>
  );
}

export default function HistoryScreen() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('visits');
  const visits = useVisits();
  const me = useMe();

  const refresh = () => {
    visits.refetch();
    me.refetch();
  };

  const header = (
    <View style={styles.topBar}>
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back} accessibilityRole="button">
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
    </View>
  );

  return (
    <Screen header={header} onRefresh={refresh} refreshing={visits.isRefetching || me.isRefetching}>
      <AppText variant="display">{t('history.title')}</AppText>
      <SegmentedControl<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'visits', label: t('history.visits') },
          { value: 'payments', label: t('history.payments') },
          { value: 'subscriptions', label: t('history.subscriptions') },
        ]}
      />
      {tab === 'visits' ? (
        visits.isPending ? (
          <LoadingState />
        ) : visits.isError ? (
          <ErrorState error={visits.error} onRetry={() => visits.refetch()} />
        ) : !visits.data?.length ? (
          <EmptyState icon="walk-outline" message={t('history.noVisits')} />
        ) : (
          <ListCard items={visits.data} render={(log) => <VisitRow log={log} />} />
        )
      ) : me.isPending ? (
        <LoadingState />
      ) : me.isError || !me.data ? (
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      ) : tab === 'payments' ? (
        me.data.profile.payments.length ? (
          <ListCard items={me.data.profile.payments} render={(payment) => <PaymentRow payment={payment} />} />
        ) : (
          <EmptyState icon="receipt-outline" message={t('history.noPayments')} />
        )
      ) : me.data.profile.subscriptions.length ? (
        <ListCard items={me.data.profile.subscriptions} render={(sub) => <SubscriptionRow subscription={sub} />} />
      ) : (
        <EmptyState icon="ribbon-outline" message={t('history.noSubscriptions')} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  rowIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  amount: { fontVariant: ['tabular-nums'] },
  side: { alignItems: 'flex-end', gap: 4 },
});
