import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { operationsApi } from '../../api/endpoints-ops';
import { errorMessage } from '../../api/client';
import type { FinanceKpis } from '../../api/types-ops';
import { Card, CardHeader, ErrorNote, PageHeader } from '../../components/ui/Card';
import { Input } from '../../components/ui/Field';
import { Skeleton } from '../../components/ui/Spinner';
import { Tabs } from '../../components/ui/Tabs';
import { useI18n } from '../../i18n';
import { formatDate, formatInt, formatPercent, formatTND, isoDay } from '../../lib/format';
import { GmvChart, MarginChart } from '../charts/Charts';
import { StatTile } from '../charts/StatTile';

type Period = 'month' | 'last' | '3m' | '12m' | 'custom';

function range(period: Period, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  const first = (y: number, m: number) => isoDay(new Date(y, m, 1));
  const last = (y: number, m: number) => isoDay(new Date(y, m + 1, 0));
  switch (period) {
    case 'month':
      return { from: first(now.getFullYear(), now.getMonth()), to: isoDay(now) };
    case 'last':
      return { from: first(now.getFullYear(), now.getMonth() - 1), to: last(now.getFullYear(), now.getMonth() - 1) };
    case '3m':
      return { from: first(now.getFullYear(), now.getMonth() - 2), to: isoDay(now) };
    case '12m':
      return { from: first(now.getFullYear(), now.getMonth() - 11), to: isoDay(now) };
    default:
      return { from: customFrom, to: customTo };
  }
}

/** Shared by the dashboard (ADMIN row) and this page. */
export function KpiCards({ data, loading, compact = false }: { data?: FinanceKpis; loading: boolean; compact?: boolean }) {
  const { t } = useI18n();
  const pct = (v?: number) => (v === undefined ? '' : formatPercent(v, 1));
  const tiles = [
    { label: t('GMV'), value: formatTND(data?.gmv), note: t('Volume brut : abonnements au prix catalogue et ventes avant remises') },
    {
      label: t('NMV'),
      value: formatTND(data?.nmv),
      note: data ? t('Après {discounts} de remises, {refunds} de remboursements et {cancellations} d’annulations', { discounts: formatTND(data.discounts), refunds: formatTND(data.refunds), cancellations: formatTND(data.cancellations) }) : undefined,
    },
    { label: t('Marge brute'), value: formatTND(data?.grossMargin), note: data ? t('{pct} du NMV, après coût des marchandises', { pct: pct(data.grossMarginPct) }) : undefined },
    { label: t('Marge opérationnelle'), value: formatTND(data?.operatingProfit), note: data ? t('{pct} du NMV, après toutes les dépenses', { pct: pct(data.operatingMarginPct) }) : undefined },
    { label: t('Encaissé'), value: formatTND(data?.cashCollected), note: t('Paiements reçus et ventes encaissées') },
    { label: t('MRR'), value: formatTND(data?.mrr), note: t('Abonnements actifs ramenés à 30 jours') },
    { label: t('ARPU'), value: formatTND(data?.arpu), note: data ? t('NMV abonnements par membre actif ({n} membres)', { n: formatInt(data.activeMembers) }) : undefined },
  ];
  const shown = compact ? tiles.slice(0, 4) : tiles;
  return (
    <div className={compact ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4' : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4'}>
      {shown.map((tile) => (
        <StatTile key={tile.label} label={tile.label} value={tile.value} note={compact ? undefined : tile.note} loading={loading} />
      ))}
    </div>
  );
}

function Breakdown({ data }: { data: FinanceKpis }) {
  const { t } = useI18n();
  const m = data.breakdown.memberships;
  const s = data.breakdown.shop;
  const rows: { label: string; memberships: number | null; shop: number | null }[] = [
    { label: t('Volume brut'), memberships: m?.gross ?? null, shop: s?.gross ?? null },
    { label: t('Remises'), memberships: m ? -m.discounts : null, shop: s ? -s.discounts : null },
    { label: t('Annulations / remboursements'), memberships: m ? -m.cancelled : null, shop: s ? -s.refunds : null },
    { label: t('Net (NMV)'), memberships: m?.net ?? null, shop: s?.net ?? null },
    { label: t('Coût des marchandises'), memberships: null, shop: s ? -s.cogs : null },
    { label: t('Marge brute'), memberships: m?.net ?? null, shop: s?.grossMargin ?? null },
  ];
  const cell = (v: number | null) => (v === null ? <span className="text-muted">—</span> : formatTND(v));
  return (
    <Card>
      <CardHeader title={t('Abonnements et boutique')} description={t('D’où vient le chiffre d’affaires sur la période')} />
      <div className="scroll-thin overflow-x-auto px-5 pb-4">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th scope="col" className="py-2 text-start font-semibold">
                <span className="sr-only">{t('Indicateur')}</span>
              </th>
              <th scope="col" className="py-2 text-end font-semibold">
                {t('Abonnements')}
              </th>
              <th scope="col" className="py-2 text-end font-semibold">
                {t('Boutique')}
              </th>
              <th scope="col" className="py-2 text-end font-semibold">
                {t('Total')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const strong = i === 3 || i === 5;
              return (
                <tr key={r.label} className="border-b border-line/60 last:border-0">
                  <th scope="row" className={`py-2 text-start ${strong ? 'font-semibold text-fg' : 'font-normal text-fg-2'}`}>
                    {r.label}
                  </th>
                  <td className="py-2 text-end tabular">{cell(r.memberships)}</td>
                  <td className="py-2 text-end tabular">{cell(r.shop)}</td>
                  <td className={`py-2 text-end tabular ${strong ? 'font-semibold' : ''}`}>{cell((r.memberships ?? 0) + (r.shop ?? 0))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!m && <p className="mt-3 text-xs text-muted">{t('Données d’abonnements indisponibles pour le moment.')}</p>}
        {!s && <p className="mt-3 text-xs text-muted">{t('Données de la boutique indisponibles pour le moment.')}</p>}
      </div>
    </Card>
  );
}

export function PerformancePage() {
  const { t } = useI18n();
  const [period, setPeriod] = useState<Period>('month');
  const [customFrom, setCustomFrom] = useState(() => isoDay(new Date(new Date().getFullYear(), 0, 1)));
  const [customTo, setCustomTo] = useState(() => isoDay());
  const { from, to } = useMemo(() => range(period, customFrom, customTo), [period, customFrom, customTo]);
  const kpis = useQuery({ queryKey: ['kpis', from, to], queryFn: () => operationsApi.kpis(from, to), placeholderData: keepPreviousData });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('Performance')} description={t('GMV, NMV, marges et revenus récurrents, abonnements et boutique réunis.')} />

      {/* One filter row scopes every number and chart below. */}
      <div className="flex flex-wrap items-end gap-3">
        <Tabs
          value={period}
          onChange={setPeriod}
          items={[
            { key: 'month', label: 'Ce mois' },
            { key: 'last', label: 'Mois dernier' },
            { key: '3m', label: '3 mois' },
            { key: '12m', label: '12 mois' },
            { key: 'custom', label: 'Personnalisé' },
          ]}
        />
        {period === 'custom' && (
          <>
            <Input label={t('Du')} type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} wrapperClassName="w-40" />
            <Input label={t('Au')} type="date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} wrapperClassName="w-40" />
          </>
        )}
        <p className="text-sm text-fg-2 sm:ms-auto">{t('Du {from} au {to}', { from: formatDate(from), to: formatDate(to) })}</p>
      </div>

      {kpis.isError && <ErrorNote message={errorMessage(kpis.error)} onRetry={() => kpis.refetch()} />}

      <div className={kpis.isFetching && kpis.data ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        <KpiCards data={kpis.data} loading={!kpis.data} />
      </div>

      {kpis.data ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <GmvChart data={kpis.data.monthly} fetching={kpis.isFetching} />
            <MarginChart data={kpis.data.monthly} fetching={kpis.isFetching} />
          </div>
          <Breakdown data={kpis.data} />
        </>
      ) : (
        !kpis.isError && <Skeleton className="h-80 rounded-xl" />
      )}
    </div>
  );
}
