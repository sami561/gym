import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CheckinStats, PlanMixItem, RevenuePoint } from '../../api/types';
import type { FinanceKpis, FinanceMonth, MeasurementDto } from '../../api/types-ops';

type FinanceKpiMonth = FinanceKpis['monthly'][number];
import {
  formatCompact,
  formatDate,
  formatInt,
  formatTND,
  formatTNDShort,
  formatNumber,
  hourLabel,
  monthLabel,
} from '../../lib/format';
import { ChartCard, DataTableMini, LegendKey } from './ChartCard';
import { useI18n } from '../../i18n';
import { TooltipBox } from './ChartTooltip';
import { useChartColors } from './useChartColors';

const AXIS_FONT = 12;
const BAR = 24; // max column thickness

/* eslint-disable @typescript-eslint/no-explicit-any -- recharts tooltip/label props */

function useAxis() {
  const c = useChartColors();
  const { t } = useI18n();
  return {
    c,
    t,
    grid: <CartesianGrid vertical={false} stroke={c.grid} strokeWidth={1} />,
    tick: { fill: c.muted, fontSize: AXIS_FONT },
    axisLine: { stroke: c.axis },
  };
}

// ---------- Revenue: one series, magnitude over 12 months ----------
export function RevenueChart({ data, fetching }: { data: RevenuePoint[]; fetching?: boolean }) {
  const { c, t, grid, tick, axisLine } = useAxis();
  const max = data.reduce((best, p) => (p.total > best.total ? p : best), data[0] ?? { month: '', total: 0, count: 0 });
  const last = data[data.length - 1];
  return (
    <ChartCard
      title={t('Revenus des abonnements')}
      subtitle={t('12 derniers mois, en dinars')}
      fetching={fetching}
      table={
        <DataTableMini
          head={[t('Mois'), t('Paiements'), t('Total')]}
          rows={data.map((p) => [monthLabel(p.month, true), formatInt(p.count), formatTND(p.total)])}
        />
      }
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 22, right: 12, left: 4, bottom: 0 }}>
          {grid}
          <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tick={tick} axisLine={axisLine} tickLine={false} />
          <YAxis tickFormatter={formatCompact} tick={tick} axisLine={false} tickLine={false} width={44} />
          <Tooltip
            cursor={{ fill: 'var(--hover-wash)' }}
            content={({ active, payload }: any) =>
              active && payload?.length ? (
                <TooltipBox
                  title={monthLabel(payload[0].payload.month, true)}
                  rows={[
                    { color: c.series1, label: t('encaissés'), value: formatTND(payload[0].payload.total) },
                    { color: 'transparent', label: t('paiements'), value: formatInt(payload[0].payload.count) },
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="total" fill={c.series1} radius={[4, 4, 0, 0]} maxBarSize={BAR} activeBar={{ fillOpacity: 0.8 }}>
            <LabelList
              dataKey="total"
              content={(props: any) => {
                const point = data[props.index];
                if (!point || (point.month !== max?.month && point.month !== last?.month) || point.total === 0) return null;
                return (
                  <text x={props.x + props.width / 2} y={props.y - 7} textAnchor="middle" fill={c.fg2} fontSize={11} fontWeight={600}>
                    {formatTNDShort(point.total)}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ---------- Check-ins: two series over 30 days ----------
export function CheckinsChart({ data, fetching }: { data: CheckinStats['daily']; fetching?: boolean }) {
  const { c, t, grid, tick, axisLine } = useAxis();
  const last = data[data.length - 1];
  const endLabel = (key: 'count' | 'unique') => (props: any) => {
    if (props.index !== data.length - 1 || !last) return null;
    return (
      <text x={props.x + 8} y={props.y + 4} fill={c.fg2} fontSize={11} fontWeight={600}>
        {formatInt(last[key])}
      </text>
    );
  };
  return (
    <ChartCard
      title={t('Fréquentation')}
      subtitle={t('Entrées par jour, 30 derniers jours')}
      fetching={fetching}
      legend={
        <>
          <LegendKey color={c.series1} label={t('Entrées')} />
          <LegendKey color={c.series2} label={t('Visiteurs uniques')} />
        </>
      }
      table={
        <DataTableMini
          head={[t('Jour'), t('Entrées'), t('Visiteurs uniques')]}
          rows={data.map((d) => [formatDate(d.date, { day: 'numeric', month: 'short' }), formatInt(d.count), formatInt(d.unique)])}
        />
      }
    >
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 12, right: 36, left: 4, bottom: 0 }}>
          {grid}
          <XAxis
            dataKey="date"
            tickFormatter={(d) => formatDate(d, { day: 'numeric', month: 'short' })}
            tick={tick}
            axisLine={axisLine}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis tickFormatter={formatCompact} tick={tick} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: c.axis, strokeWidth: 1 }}
            content={({ active, payload }: any) =>
              active && payload?.length ? (
                <TooltipBox
                  title={formatDate(payload[0].payload.date, { weekday: 'long', day: 'numeric', month: 'long' })}
                  rows={[
                    { color: c.series1, label: t('entrées'), value: formatInt(payload[0].payload.count) },
                    { color: c.series2, label: t('visiteurs uniques'), value: formatInt(payload[0].payload.unique) },
                  ]}
                />
              ) : null
            }
          />
          <Line type="monotone" dataKey="count" stroke={c.series1} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false}>
            <LabelList content={endLabel('count')} />
          </Line>
          <Line type="monotone" dataKey="unique" stroke={c.series2} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false}>
            <LabelList content={endLabel('unique')} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ---------- Hourly distribution: 24 ordered columns ----------
export function HourlyChart({ data, fetching }: { data: CheckinStats['hourly']; fetching?: boolean }) {
  const { c, t, grid, tick, axisLine } = useAxis();
  const full = Array.from({ length: 24 }, (_, hour) => ({ hour, count: data.find((d) => d.hour === hour)?.count ?? 0 }));
  const peak = full.reduce((best, d) => (d.count > best.count ? d : best), full[0]);
  return (
    <ChartCard
      title={t('Heures d’affluence')}
      subtitle={peak.count > 0 ? t('Pic à {hour} sur les 30 derniers jours', { hour: hourLabel(peak.hour) }) : t('Entrées par heure, 30 derniers jours')}
      fetching={fetching}
      table={<DataTableMini head={[t('Heure'), t('Entrées')]} rows={full.map((d) => [hourLabel(d.hour), formatInt(d.count)])} />}
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={full} margin={{ top: 22, right: 8, left: 4, bottom: 0 }}>
          {grid}
          <XAxis dataKey="hour" tickFormatter={(h) => hourLabel(h)} tick={tick} axisLine={axisLine} tickLine={false} interval={2} />
          <YAxis tickFormatter={formatCompact} tick={tick} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: 'var(--hover-wash)' }}
            content={({ active, payload }: any) =>
              active && payload?.length ? (
                <TooltipBox
                  title={`${hourLabel(payload[0].payload.hour)} – ${hourLabel(payload[0].payload.hour + 1)}`}
                  rows={[{ color: c.series1, label: t('entrées'), value: formatInt(payload[0].payload.count) }]}
                />
              ) : null
            }
          />
          <Bar dataKey="count" fill={c.series1} radius={[4, 4, 0, 0]} maxBarSize={BAR} activeBar={{ fillOpacity: 0.8 }}>
            <LabelList
              content={(props: any) =>
                props.index === peak.hour && peak.count > 0 ? (
                  <text x={props.x + props.width / 2} y={props.y - 7} textAnchor="middle" fill={c.fg2} fontSize={11} fontWeight={600}>
                    {formatInt(peak.count)}
                  </text>
                ) : null
              }
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ---------- Plan mix: nominal categories, one hue, values at the tips ----------
export function PlanMixChart({ data, fetching }: { data: PlanMixItem[]; fetching?: boolean }) {
  const { c, t, tick } = useAxis();
  const sorted = [...data].sort((a, b) => b.activeCount - a.activeCount);
  const height = Math.max(160, sorted.length * 40 + 24);
  return (
    <ChartCard
      title={t('Répartition des offres')}
      subtitle={t('Membres actifs par offre')}
      fetching={fetching}
      table={<DataTableMini head={[t('Offre'), t('Membres actifs')]} rows={sorted.map((p) => [p.planName, formatInt(p.activeCount)])} />}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 4 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="planName" tick={tick} axisLine={false} tickLine={false} width={110} />
          <Tooltip
            cursor={{ fill: 'var(--hover-wash)' }}
            content={({ active, payload }: any) =>
              active && payload?.length ? (
                <TooltipBox title={payload[0].payload.planName} rows={[{ color: c.series1, label: t('membres actifs'), value: formatInt(payload[0].payload.activeCount) }]} />
              ) : null
            }
          />
          <Bar dataKey="activeCount" fill={c.series1} radius={[0, 4, 4, 0]} barSize={18} activeBar={{ fillOpacity: 0.8 }}>
            <LabelList dataKey="activeCount" position="right" fill={c.fg2} fontSize={12} fontWeight={600} formatter={(v: any) => formatInt(Number(v))} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ---------- Finance: revenue vs expenses (grouped), profit (diverging) ----------
export function RevenueExpensesChart({ data, fetching }: { data: FinanceMonth[]; fetching?: boolean }) {
  const { c, t, grid, tick, axisLine } = useAxis();
  const rows = data.map((m) => ({ ...m, revenue: m.membershipRevenue + m.salesRevenue }));
  return (
    <ChartCard
      title={t('Recettes et dépenses')}
      subtitle={t('Abonnements + boutique, comparés aux dépenses')}
      fetching={fetching}
      legend={
        <>
          <LegendKey color={c.series1} label={t('Recettes')} kind="rect" />
          <LegendKey color={c.series2} label={t('Dépenses')} kind="rect" />
        </>
      }
      table={
        <DataTableMini
          head={[t('Mois'), t('Abonnements'), t('Boutique'), t('Dépenses'), t('Résultat')]}
          rows={rows.map((m) => [monthLabel(m.month, true), formatTND(m.membershipRevenue), formatTND(m.salesRevenue), formatTND(m.expenses), formatTND(m.profit)])}
        />
      }
    >
      <ResponsiveContainer width="100%" height={270}>
        <BarChart data={rows} margin={{ top: 12, right: 12, left: 4, bottom: 0 }} barGap={2} barCategoryGap="22%">
          {grid}
          <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tick={tick} axisLine={axisLine} tickLine={false} />
          <YAxis tickFormatter={formatCompact} tick={tick} axisLine={false} tickLine={false} width={44} />
          <Tooltip
            cursor={{ fill: 'var(--hover-wash)' }}
            content={({ active, payload }: any) =>
              active && payload?.length ? (
                <TooltipBox
                  title={monthLabel(payload[0].payload.month, true)}
                  rows={[
                    { color: c.series1, label: t('recettes'), value: formatTND(payload[0].payload.revenue) },
                    { color: c.series2, label: t('dépenses'), value: formatTND(payload[0].payload.expenses) },
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="revenue" fill={c.series1} radius={[4, 4, 0, 0]} maxBarSize={BAR} />
          <Bar dataKey="expenses" fill={c.series2} radius={[4, 4, 0, 0]} maxBarSize={BAR} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function ProfitChart({ data, fetching }: { data: FinanceMonth[]; fetching?: boolean }) {
  const { c, t, grid, tick, axisLine } = useAxis();
  // Diverging pair: blue above zero, red below, neutral baseline.
  const positive = c.series1;
  const negative = document.documentElement.dataset.theme === 'light' ? '#e34948' : '#e66767';
  return (
    <ChartCard
      title={t('Résultat mensuel')}
      subtitle={t('Recettes moins dépenses')}
      fetching={fetching}
      legend={
        <>
          <LegendKey color={positive} label={t('Bénéfice')} kind="rect" />
          <LegendKey color={negative} label={t('Perte')} kind="rect" />
        </>
      }
      table={<DataTableMini head={[t('Mois'), t('Résultat')]} rows={data.map((m) => [monthLabel(m.month, true), formatTND(m.profit)])} />}
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}>
          {grid}
          <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tick={tick} axisLine={axisLine} tickLine={false} />
          <YAxis tickFormatter={formatCompact} tick={tick} axisLine={false} tickLine={false} width={44} />
          <ReferenceLine y={0} stroke={c.axis} />
          <Tooltip
            cursor={{ fill: 'var(--hover-wash)' }}
            content={({ active, payload }: any) =>
              active && payload?.length ? (
                <TooltipBox
                  title={monthLabel(payload[0].payload.month, true)}
                  rows={[{ color: payload[0].payload.profit >= 0 ? positive : negative, label: t('résultat'), value: formatTND(payload[0].payload.profit) }]}
                />
              ) : null
            }
          />
          <Bar dataKey="profit" maxBarSize={BAR} radius={[4, 4, 4, 4]}>
            {data.map((m) => (
              <Cell key={m.month} fill={m.profit >= 0 ? positive : negative} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function CategoryBarsChart({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle?: string;
  data: { label: string; value: number }[];
}) {
  const { c, t, tick } = useAxis();
  const sorted = [...data].sort((a, b) => b.value - a.value);
  return (
    <ChartCard title={title} subtitle={subtitle} table={<DataTableMini head={[t('Catégorie'), t('Montant')]} rows={sorted.map((d) => [d.label, formatTND(d.value)])} />}>
      <ResponsiveContainer width="100%" height={Math.max(160, sorted.length * 36 + 20)}>
        <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 64, left: 4, bottom: 4 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" tick={tick} axisLine={false} tickLine={false} width={150} />
          <Tooltip
            cursor={{ fill: 'var(--hover-wash)' }}
            content={({ active, payload }: any) =>
              active && payload?.length ? <TooltipBox title={payload[0].payload.label} rows={[{ color: c.series1, label: '', value: formatTND(payload[0].payload.value) }]} /> : null
            }
          />
          <Bar dataKey="value" fill={c.series1} radius={[0, 4, 4, 0]} barSize={16}>
            <LabelList dataKey="value" position="right" fill={c.fg2} fontSize={12} fontWeight={600} formatter={(v: any) => formatTNDShort(Number(v))} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ---------- Body measurements: weight trend (one series, no second axis) ----------
export function WeightChart({ data }: { data: MeasurementDto[] }) {
  const { c, t, grid, tick, axisLine } = useAxis();
  const points = data.filter((m) => m.weightKg !== null);
  const last = points[points.length - 1];
  return (
    <ChartCard
      title={t('Évolution du poids')}
      subtitle={last ? t('Dernière mesure : {kg} kg le {date}', { kg: formatNumber(last.weightKg ?? 0), date: formatDate(last.date) }) : t('Aucune pesée enregistrée')}
      table={
        <DataTableMini
          head={[t('Date'), t('Poids'), t('Masse grasse'), t('Tour de taille'), t('IMC')]}
          rows={data.map((m) => [
            formatDate(m.date),
            m.weightKg !== null ? `${m.weightKg} kg` : '—',
            m.bodyFatPct !== null ? `${m.bodyFatPct} %` : '—',
            m.waistCm !== null ? `${m.waistCm} cm` : '—',
            m.bmi !== null ? m.bmi.toFixed(1) : '—',
          ])}
        />
      }
    >
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points} margin={{ top: 12, right: 40, left: 4, bottom: 0 }}>
          {grid}
          <XAxis dataKey="date" tickFormatter={(d) => formatDate(d, { day: 'numeric', month: 'short' })} tick={tick} axisLine={axisLine} tickLine={false} minTickGap={20} />
          <YAxis domain={['dataMin - 2', 'dataMax + 2']} tick={tick} axisLine={false} tickLine={false} width={36} tickFormatter={(v) => `${Math.round(v)}`} />
          <Tooltip
            cursor={{ stroke: c.axis, strokeWidth: 1 }}
            content={({ active, payload }: any) =>
              active && payload?.length ? <TooltipBox title={formatDate(payload[0].payload.date)} rows={[{ color: c.series1, label: 'kg', value: formatNumber(payload[0].payload.weightKg) }]} /> : null
            }
          />
          <Line type="monotone" dataKey="weightKg" stroke={c.series1} strokeWidth={2} dot={{ r: 4, fill: c.series1, stroke: c.surface, strokeWidth: 2 }} activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false}>
            <LabelList
              content={(props: any) =>
                props.index === points.length - 1 ? (
                  <text x={props.x + 8} y={props.y + 4} fill={c.fg2} fontSize={11} fontWeight={600}>
                    {`${formatNumber(points[props.index].weightKg ?? 0)} kg`}
                  </text>
                ) : null
              }
            />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ---------- Business KPIs: GMV / NMV / expenses (grouped), margin % (own chart, never a second axis) ----------
export function GmvChart({ data, fetching }: { data: FinanceKpiMonth[]; fetching?: boolean }) {
  const { c, t, grid, tick, axisLine } = useAxis();
  return (
    <ChartCard
      title={t('GMV, NMV et dépenses')}
      subtitle={t('Par mois, en dinars')}
      fetching={fetching}
      legend={
        <>
          <LegendKey color={c.series1} label={t('GMV')} kind="rect" />
          <LegendKey color={c.series2} label={t('NMV')} kind="rect" />
          <LegendKey color={c.series3} label={t('Dépenses')} kind="rect" />
        </>
      }
      table={
        <DataTableMini
          head={[t('Mois'), t('GMV'), t('NMV'), t('Dépenses'), t('Résultat')]}
          rows={data.map((m) => [monthLabel(m.month, true), formatTND(m.gmv), formatTND(m.nmv), formatTND(m.expenses), formatTND(m.profit)])}
        />
      }
    >
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 12, right: 12, left: 4, bottom: 0 }} barGap={2} barCategoryGap="20%">
          {grid}
          <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tick={tick} axisLine={axisLine} tickLine={false} />
          <YAxis tickFormatter={formatCompact} tick={tick} axisLine={false} tickLine={false} width={44} />
          <Tooltip
            cursor={{ fill: 'var(--hover-wash)' }}
            content={({ active, payload }: any) =>
              active && payload?.length ? (
                <TooltipBox
                  title={monthLabel(payload[0].payload.month, true)}
                  rows={[
                    { color: c.series1, label: t('GMV'), value: formatTND(payload[0].payload.gmv) },
                    { color: c.series2, label: t('NMV'), value: formatTND(payload[0].payload.nmv) },
                    { color: c.series3, label: t('dépenses'), value: formatTND(payload[0].payload.expenses) },
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="gmv" fill={c.series1} radius={[4, 4, 0, 0]} maxBarSize={BAR} />
          <Bar dataKey="nmv" fill={c.series2} radius={[4, 4, 0, 0]} maxBarSize={BAR} />
          <Bar dataKey="expenses" fill={c.series3} radius={[4, 4, 0, 0]} maxBarSize={BAR} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function MarginChart({ data, fetching }: { data: FinanceKpiMonth[]; fetching?: boolean }) {
  const { c, t, grid, tick, axisLine } = useAxis();
  const last = data[data.length - 1];
  const pct = (v: number) => `${formatNumber(v * 100)} %`;
  return (
    <ChartCard
      title={t('Marge opérationnelle')}
      subtitle={t('Résultat / NMV, par mois')}
      fetching={fetching}
      table={<DataTableMini head={[t('Mois'), t('Marge')]} rows={data.map((m) => [monthLabel(m.month, true), pct(m.marginPct)])} />}
    >
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 12, right: 48, left: 4, bottom: 0 }}>
          {grid}
          <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tick={tick} axisLine={axisLine} tickLine={false} />
          <YAxis tickFormatter={(v) => `${Math.round(v * 100)} %`} tick={tick} axisLine={false} tickLine={false} width={48} />
          <ReferenceLine y={0} stroke={c.axis} />
          <Tooltip
            cursor={{ stroke: c.axis, strokeWidth: 1 }}
            content={({ active, payload }: any) =>
              active && payload?.length ? <TooltipBox title={monthLabel(payload[0].payload.month, true)} rows={[{ color: c.series1, label: t('marge'), value: pct(payload[0].payload.marginPct) }]} /> : null
            }
          />
          <Line type="monotone" dataKey="marginPct" stroke={c.series1} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false}>
            <LabelList
              content={(props: any) =>
                props.index === data.length - 1 && last ? (
                  <text x={props.x + 8} y={props.y + 4} fill={c.fg2} fontSize={11} fontWeight={600}>
                    {pct(last.marginPct)}
                  </text>
                ) : null
              }
            />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ---------- Members analytics ----------
export function MonthlyCountChart({ title, subtitle, data, label }: { title: string; subtitle?: string; data: { month: string; count: number }[]; label: string }) {
  const { c, t, grid, tick, axisLine } = useAxis();
  const last = data[data.length - 1];
  return (
    <ChartCard title={title} subtitle={subtitle} table={<DataTableMini head={[t('Mois'), label]} rows={data.map((d) => [monthLabel(d.month, true), formatInt(d.count)])} />}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 22, right: 12, left: 4, bottom: 0 }}>
          {grid}
          <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tick={tick} axisLine={axisLine} tickLine={false} />
          <YAxis tick={tick} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: 'var(--hover-wash)' }}
            content={({ active, payload }: any) =>
              active && payload?.length ? <TooltipBox title={monthLabel(payload[0].payload.month, true)} rows={[{ color: c.series1, label, value: formatInt(payload[0].payload.count) }]} /> : null
            }
          />
          <Bar dataKey="count" fill={c.series1} radius={[4, 4, 0, 0]} maxBarSize={BAR}>
            <LabelList
              content={(props: any) =>
                props.index === data.length - 1 && last ? (
                  <text x={props.x + props.width / 2} y={props.y - 7} textAnchor="middle" fill={c.fg2} fontSize={11} fontWeight={600}>
                    {formatInt(last.count)}
                  </text>
                ) : null
              }
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Ordered categories (age groups): ordinal ramp, unknown bucket in the "other" grey. */
export function AgeGroupsChart({ data }: { data: { label: string; count: number }[] }) {
  const { c, t, grid, tick, axisLine } = useAxis();
  const known = data.filter((d) => !/inconnu|non renseign|unknown/i.test(d.label));
  const ramp = (i: number) => {
    if (known.length > c.ordinal.length) return c.series1;
    const step = known.length === 1 ? 2 : Math.round((i * (c.ordinal.length - 1)) / Math.max(1, known.length - 1));
    return c.ordinal[step];
  };
  return (
    <ChartCard title={t('Tranches d’âge')} subtitle={t('Membres par âge')} table={<DataTableMini head={[t('Âge'), t('Membres')]} rows={data.map((d) => [d.label, formatInt(d.count)])} />}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 22, right: 8, left: 4, bottom: 0 }}>
          {grid}
          <XAxis dataKey="label" tick={tick} axisLine={axisLine} tickLine={false} />
          <YAxis tick={tick} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: 'var(--hover-wash)' }}
            content={({ active, payload }: any) =>
              active && payload?.length ? <TooltipBox title={payload[0].payload.label} rows={[{ color: c.series1, label: t('membres'), value: formatInt(payload[0].payload.count) }]} /> : null
            }
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={36}>
            {data.map((d) => {
              const i = known.indexOf(d);
              return <Cell key={d.label} fill={i === -1 ? c.other : ramp(i)} />;
            })}
            <LabelList dataKey="count" position="top" fill={c.fg2} fontSize={11} fontWeight={600} formatter={(v: any) => formatInt(Number(v))} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Part-to-whole in one stacked bar: women, men, unknown (grey). Legend + direct labels. */
export function GenderSplit({ data }: { data: { gender: 'MALE' | 'FEMALE' | 'UNKNOWN'; count: number }[] }) {
  const c = useChartColors();
  const { t } = useI18n();
  const labels = { FEMALE: t('Femmes'), MALE: t('Hommes'), UNKNOWN: t('Non renseigné') };
  const colors = { FEMALE: c.series1, MALE: c.series2, UNKNOWN: c.other };
  const order: ('FEMALE' | 'MALE' | 'UNKNOWN')[] = ['FEMALE', 'MALE', 'UNKNOWN'];
  const rows = order.map((g) => ({ gender: g, count: data.find((d) => d.gender === g)?.count ?? 0 })).filter((r) => r.count > 0);
  const total = rows.reduce((s, r) => s + r.count, 0) || 1;
  return (
    <ChartCard
      title={t('Répartition femmes / hommes')}
      legend={rows.map((r) => (
        <LegendKey key={r.gender} color={colors[r.gender]} label={labels[r.gender]} kind="rect" />
      ))}
      table={<DataTableMini head={[t('Genre'), t('Membres'), t('Part')]} rows={rows.map((r) => [labels[r.gender], formatInt(r.count), `${Math.round((r.count / total) * 100)} %`])} />}
    >
      <div className="px-3 pt-2 pb-1">
        <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={rows.map((r) => `${labels[r.gender]} ${Math.round((r.count / total) * 100)} %`).join(', ')}>
          {rows.map((r) => (
            <div key={r.gender} style={{ width: `${(r.count / total) * 100}%`, background: colors[r.gender] }} title={`${labels[r.gender]} : ${formatInt(r.count)}`} />
          ))}
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {rows.map((r) => (
            <div key={r.gender} className="flex items-baseline gap-1.5">
              <dt className="text-fg-2">{labels[r.gender]}</dt>
              <dd className="font-semibold text-fg tabular">{Math.round((r.count / total) * 100)} %</dd>
            </div>
          ))}
        </dl>
      </div>
    </ChartCard>
  );
}
