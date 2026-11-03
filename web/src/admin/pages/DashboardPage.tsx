import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Radio } from 'lucide-react';
import clsx from 'clsx';
import { accessApi, dashboardApi } from '../../api/endpoints';
import { employeesApi, operationsApi } from '../../api/endpoints-ops';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../api/auth';
import { useLiveAccess } from '../../api/live';
import type { AccessLogDto } from '../../api/types';
import type { OnDutyEntry } from '../../api/types-ops';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader, EmptyState, ErrorNote, PageHeader } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Spinner';
import { useI18n, type TFunction } from '../../i18n';
import {
  ACCESS_METHOD_LABELS,
  formatDate,
  formatInt,
  formatPercent,
  formatTime,
  formatTND,
  formatTNDShort,
  fullName,
  isoDay,
  relativeTime,
} from '../../lib/format';
import { POSITION_LABELS } from '../../lib/labels-ops';
import { AgeGroupsChart, CheckinsChart, GenderSplit, HourlyChart, MonthlyCountChart, PlanMixChart, RevenueChart } from '../charts/Charts';
import { StatTile, type Delta } from '../charts/StatTile';
import { LogAvatar } from '../photos/LogAvatar';
import { POSITION_ORDER, ShiftTimeline, useNow, usePositionColor } from './hr/team';
import { KpiCards } from './PerformancePage';

function revenueDelta(thisMonth: number, lastMonth: number, t: TFunction): Delta | undefined {
  if (!lastMonth) return undefined;
  const change = (thisMonth - lastMonth) / lastMonth;
  return {
    label: `${change >= 0 ? '+' : ''}${formatPercent(change)}`,
    direction: Math.abs(change) < 0.005 ? 'flat' : change > 0 ? 'up' : 'down',
    upIsGood: true,
    period: t('vs mois dernier'),
  };
}

export function LiveFeed({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const recent = useQuery({ queryKey: ['access', 'logs', 'recent'], queryFn: () => accessApi.logs({ limit: 12 }) });
  const { events, status } = useLiveAccess(() => {
    void queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] });
  });
  const merged: AccessLogDto[] = [...events, ...(recent.data ?? []).filter((log) => !events.some((e) => e.id === log.id))].slice(0, compact ? 8 : 14);

  return (
    <Card className="flex flex-col">
      <CardHeader
        title={t('Entrées en direct')}
        description={t('Chaque passage aux portes, en temps réel')}
        actions={
          <span className={clsx('inline-flex items-center gap-1.5 text-xs font-medium', status === 'live' ? 'text-good' : 'text-muted')}>
            <Radio className={clsx('size-3.5', status === 'live' && 'animate-pulse')} aria-hidden />
            {status === 'live' ? t('En direct') : status === 'connecting' ? t('Connexion…') : t('Hors ligne')}
          </span>
        }
      />
      <ul className="scroll-thin flex-1 overflow-y-auto px-2 pb-3" aria-live="polite">
        {recent.isLoading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="mx-3 my-2 h-10" />)}
        {!recent.isLoading && merged.length === 0 && <EmptyState title={t('Aucune entrée pour l’instant')} description={t('Les passages apparaîtront ici dès l’ouverture de la porte.')} />}
        <AnimatePresence initial={false}>
          {merged.map((log) => (
            <motion.li
              key={log.id}
              layout
              initial={{ opacity: 0, backgroundColor: 'var(--hover-wash)' }}
              animate={{ opacity: 1, backgroundColor: 'rgba(0,0,0,0)' }}
              transition={{ duration: 1.2 }}
              className="flex items-center gap-3 rounded-lg px-3 py-2"
            >
              <LogAvatar log={log} showResult />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">
                  {log.memberName ?? (log.method === 'MANUAL' ? (log.openedByName ? t('Ouverture manuelle par {name}', { name: log.openedByName }) : t('Ouverture manuelle')) : t('Inconnu'))}
                </p>
                <p className="truncate text-xs text-muted">
                  {[log.result === 'GRANTED' ? t('Autorisé') : log.reason ? t('Refusé : {reason}', { reason: log.reason }) : t('Refusé'), t(ACCESS_METHOD_LABELS[log.method]), log.doorName].filter(Boolean).join(', ')}
                </p>
              </div>
              <time className="shrink-0 text-xs text-muted" dateTime={log.createdAt}>
                {relativeTime(log.createdAt)}
              </time>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </Card>
  );
}

function OpsTile({ title, to, lines }: { title: string; to: string; lines: { label: string; value: string; alert?: boolean }[] | null }) {
  const { t } = useI18n();
  return (
    <Link to={to} className="group rounded-xl bg-card px-4 py-3.5 ring-1 ring-line transition-shadow hover:ring-fg-2/40">
      <p className="text-sm font-semibold text-fg group-hover:underline">{title}</p>
      {lines === null ? (
        <p className="mt-2 text-xs text-muted">{t('Service indisponible')}</p>
      ) : (
        <dl className="mt-2 flex flex-col gap-1">
          {lines.map((line) => (
            <div key={line.label} className="flex items-baseline justify-between gap-3 text-sm">
              <dt className="text-fg-2">{line.label}</dt>
              <dd className={clsx('font-semibold tabular', line.alert ? 'text-bad' : 'text-fg')}>
                {line.alert && <AlertTriangle className="me-1 inline size-3.5 align-[-2px]" aria-label={t('Attention')} />}
                {line.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Link>
  );
}

function OperationsRow() {
  const { t } = useI18n();
  const ops = useQuery({ queryKey: ['dashboard', 'operations'], queryFn: operationsApi.summary, refetchInterval: 60_000 });
  if (ops.isError) return <ErrorNote message={errorMessage(ops.error)} onRetry={() => ops.refetch()} />;
  const d = ops.data;
  if (!d) return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <OpsTile
        title={t('Équipe')}
        to="/admin/rh"
        lines={d.staff && [
          { label: t('Présents'), value: `${d.staff.presentNow} / ${d.staff.activeEmployees}` },
          { label: t('Congés à valider'), value: formatInt(d.staff.pendingLeaves), alert: d.staff.pendingLeaves > 0 },
        ]}
      />
      <OpsTile
        title={t('Salles')}
        to="/admin/salles"
        lines={d.facility && [
          { label: t('Pannes ouvertes'), value: formatInt(d.facility.openTickets), alert: d.facility.urgentTickets > 0 },
          { label: t('Entretiens dus'), value: formatInt(d.facility.maintenanceDue), alert: d.facility.maintenanceDue > 0 },
        ]}
      />
      <OpsTile
        title={t('Boutique')}
        to="/admin/boutique"
        lines={d.commerce && [
          { label: t('Ventes du jour'), value: formatTNDShort(d.commerce.salesToday) },
          { label: t('Stocks bas'), value: formatInt(d.commerce.lowStockProducts), alert: d.commerce.lowStockProducts > 0 },
        ]}
      />
      <OpsTile
        title={t('Prospects')}
        to="/admin/prospects"
        lines={d.leads && [
          { label: t('Nouveaux ce mois'), value: formatInt(d.leads.newThisMonth) },
          { label: t('Relances dues'), value: formatInt(d.leads.followUpsDue), alert: d.leads.followUpsDue > 0 },
        ]}
      />
      <OpsTile
        title={t('Entraînement')}
        to="/admin/entrainement"
        lines={d.training && [
          { label: t('Programmes actifs'), value: formatInt(d.training.activePrograms) },
          { label: t('Séances PT du mois'), value: formatInt(d.training.ptSessionsThisMonth) },
        ]}
      />
      <OpsTile
        title={t('Tâches et workflows')}
        to="/admin/taches"
        lines={d.workflows && [
          { label: t('Tâches ouvertes'), value: formatInt(d.workflows.openTasks) },
          { label: t('En retard'), value: formatInt(d.workflows.overdueTasks), alert: d.workflows.overdueTasks > 0 },
        ]}
      />
    </div>
  );
}

function MembersBlock() {
  const { t } = useI18n();
  const analytics = useQuery({ queryKey: ['dashboard', 'members-analytics'], queryFn: operationsApi.membersAnalytics });
  const a = analytics.data;
  if (analytics.isError) return <ErrorNote message={errorMessage(analytics.error)} onRetry={() => analytics.refetch()} />;
  const tiles = [
    { label: t('Inscrits'), value: a?.total },
    { label: t('Actifs'), value: a?.active },
    { label: t('Expirés'), value: a?.expired },
    { label: t('Gelés'), value: a?.frozen },
    { label: t('Suspendus'), value: a?.suspended },
    { label: t('Jamais abonnés'), value: a?.neverSubscribed },
  ];
  return (
    <section aria-labelledby="members-title" className="flex flex-col gap-3">
      <h2 id="members-title" className="text-[15px] font-semibold text-fg">
        {t('Adhérents')}
      </h2>
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((tile) => (
          <StatTile key={tile.label} label={tile.label} value={formatInt(tile.value)} loading={!a} />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile label={t('Départs sur 30 jours')} value={formatInt(a?.churnedLast30d)} loading={!a} note={t('Abonnements terminés sans renouvellement')} />
        <StatTile label={t('Taux de renouvellement')} value={a ? formatPercent(a.renewalRate90d) : ''} loading={!a} note={t('Abonnements terminés sur 90 jours et renouvelés')} />
      </div>
      {a ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <MonthlyCountChart title={t('Nouveaux membres')} subtitle={t('Inscriptions par mois, 12 derniers mois')} data={a.newPerMonth} label={t('inscriptions')} />
          <AgeGroupsChart data={a.byAgeGroup} />
          <GenderSplit data={a.byGender} />
        </div>
      ) : (
        <Skeleton className="h-72 rounded-xl" />
      )}
    </section>
  );
}

function dutyBadge(entry: OnDutyEntry, now: Date, t: TFunction) {
  if (entry.clockedInAt) return <Badge tone="good">{t('Pointé à {time}', { time: formatTime(entry.clockedInAt) })}</Badge>;
  if (!entry.shift) return <Badge tone="info">{t('Hors planning')}</Badge>;
  const start = new Date(entry.shift.startsAt).getTime();
  const end = new Date(entry.shift.endsAt).getTime();
  if (now.getTime() > end) return <Badge tone="bad">{t('Absent')}</Badge>;
  if (now.getTime() > start + 10 * 60_000) return <Badge tone="bad">{t('En retard, non pointé')}</Badge>;
  return <Badge tone="warn">{t('Attendu à {time}', { time: formatTime(entry.shift.startsAt) })}</Badge>;
}

function TeamBlock() {
  const { t } = useI18n();
  const now = useNow();
  const color = usePositionColor();
  const team = useQuery({ queryKey: ['dashboard', 'team', isoDay()], queryFn: () => operationsApi.team(), refetchInterval: 60_000 });
  const employees = useQuery({ queryKey: ['employees', 'all'], queryFn: () => employeesApi.list() });
  const d = team.data;
  const positionOf = (id: string) => employees.data?.find((e) => e.id === id)?.position ?? d?.onDutyNow.find((o) => o.employeeId === id)?.position ?? null;
  if (team.isError) return <ErrorNote message={errorMessage(team.error)} onRetry={() => team.refetch()} />;

  const rows = d
    ? [...new Map(d.shifts.map((s) => [s.employeeId, s])).values()].map((s) => ({
        employeeId: s.employeeId,
        name: s.employeeName,
        position: positionOf(s.employeeId),
      }))
    : [];

  return (
    <section aria-labelledby="team-title" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="team-title" className="text-[15px] font-semibold text-fg">
          {t('Équipe')}
        </h2>
        <Link to="/admin/calendrier-equipe" className="text-sm text-fg-2 hover:text-fg hover:underline">
          {t('Calendrier de l’équipe')}
        </Link>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-fg-2">{t('Employés actifs')}</p>
          {d ? (
            <p className="text-[28px] leading-tight font-semibold text-fg">
              {formatInt(d.employees.active)}
              <span className="ms-2 text-sm font-normal text-muted">{t('sur {n}', { n: formatInt(d.employees.total) })}</span>
            </p>
          ) : (
            <Skeleton className="mt-1 h-8 w-24" />
          )}
          <ul className="mt-4 flex flex-col gap-1.5">
            {POSITION_ORDER.map((p) => {
              const count = d?.employees.byPosition.find((b) => b.position === p)?.count ?? 0;
              if (!count) return null;
              return (
                <li key={p} className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 rounded-[3px]" style={{ background: color(p) }} aria-hidden />
                  <span className="flex-1 text-fg-2">{t(POSITION_LABELS[p])}</span>
                  <span className="font-semibold text-fg tabular">{count}</span>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader
            title={t('En service maintenant')}
            description={d ? t('{n} présents sur place', { n: formatInt(d.presentNow) }) : undefined}
          />
          {d && d.onDutyNow.length === 0 && <EmptyState title={t('Personne n’est en service en ce moment')} />}
          <ul className="divide-y divide-line px-2 pb-2">
            {d?.onDutyNow.map((entry) => (
              <li key={entry.employeeId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: color(entry.position) }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{entry.name}</p>
                  <p className="text-xs text-muted">
                    {t(POSITION_LABELS[entry.position])}
                    {entry.shift ? `, ${formatTime(entry.shift.startsAt)}–${formatTime(entry.shift.endsAt)}` : ''}
                    {entry.shift?.task ? `, ${entry.shift.task}` : ''}
                  </p>
                </div>
                {dutyBadge(entry, now, t)}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      {d && <ShiftTimeline day={new Date()} rows={rows} shifts={d.shifts} title={t('Planning du jour')} subtitle={formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })} />}
    </section>
  );
}

function PerformanceRow() {
  const { t } = useI18n();
  const kpis = useQuery({ queryKey: ['kpis', 'dashboard'], queryFn: () => operationsApi.kpis() });
  if (kpis.isError) return null;
  return (
    <section aria-labelledby="perf-title" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="perf-title" className="text-[15px] font-semibold text-fg">
          {t('Performance du mois')}
        </h2>
        <Link to="/admin/performance" className="text-sm text-fg-2 hover:text-fg hover:underline">
          {t('Voir le détail')}
        </Link>
      </div>
      <KpiCards data={kpis.data} loading={!kpis.data} compact />
    </section>
  );
}

export function DashboardPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const summary = useQuery({ queryKey: ['dashboard', 'summary'], queryFn: dashboardApi.summary, refetchInterval: 60_000 });
  const revenue = useQuery({ queryKey: ['dashboard', 'revenue'], queryFn: () => dashboardApi.revenue(12), placeholderData: keepPreviousData });
  const checkins = useQuery({ queryKey: ['dashboard', 'checkins'], queryFn: () => dashboardApi.checkins(30), placeholderData: keepPreviousData });
  const planMix = useQuery({ queryKey: ['dashboard', 'plan-mix'], queryFn: dashboardApi.planMix });
  const expiring = useQuery({ queryKey: ['dashboard', 'expiring'], queryFn: () => dashboardApi.expiring(7) });
  const s = summary.data;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t('Tableau de bord')} description={formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} />

      {summary.isError && <ErrorNote message={errorMessage(summary.error)} onRetry={() => summary.refetch()} />}

      <section aria-label={t('Indicateurs clés')} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={t('Membres actifs')}
          loading={!s}
          value={formatInt(s?.members.active)}
          note={s ? t('sur {total} inscrits, +{new} ce mois', { total: formatInt(s.members.total), new: formatInt(s.members.newThisMonth) }) : undefined}
        />
        <StatTile
          label={t('Revenus du mois')}
          loading={!s}
          value={formatTNDShort(s?.revenue.thisMonth)}
          delta={s ? revenueDelta(s.revenue.thisMonth, s.revenue.lastMonth, t) : undefined}
          note={s ? t('{amount} aujourd’hui', { amount: formatTND(s.revenue.today) }) : undefined}
        />
        <StatTile
          label={t('Entrées aujourd’hui')}
          loading={!s}
          value={formatInt(s?.checkIns.today)}
          note={s ? t('{unique} visiteurs, {denied} refus', { unique: formatInt(s.checkIns.uniqueToday), denied: formatInt(s.checkIns.deniedToday) }) : undefined}
        />
        <StatTile
          label={t('Abonnements à renouveler')}
          loading={!s}
          value={formatInt(s?.members.expiringSoon)}
          status={
            s && s.members.expiringSoon > 0 ? (
              <span className="inline-flex items-center gap-1 font-semibold text-warn">
                <AlertTriangle className="size-3.5" aria-hidden />
                {t('À relancer cette semaine')}
              </span>
            ) : undefined
          }
          note={
            s
              ? [
                  t('{n} cours aujourd’hui', { n: formatInt(s.classes.today) }),
                  s.classes.waitlisted ? t('{n} en liste d’attente', { n: formatInt(s.classes.waitlisted) }) : null,
                  s.classes.noShows30d ? t('{n} absences sur 30 j', { n: formatInt(s.classes.noShows30d) }) : null,
                ]
                  .filter(Boolean)
                  .join(', ')
              : undefined
          }
        />
      </section>

      {user?.role === 'ADMIN' && <PerformanceRow />}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {revenue.data ? <RevenueChart data={revenue.data} fetching={revenue.isFetching} /> : <Skeleton className="h-[340px] rounded-xl" />}
        </div>
        {planMix.data ? <PlanMixChart data={planMix.data} fetching={planMix.isFetching} /> : <Skeleton className="h-[340px] rounded-xl" />}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {checkins.data ? <CheckinsChart data={checkins.data.daily} fetching={checkins.isFetching} /> : <Skeleton className="h-[360px] rounded-xl" />}
        </div>
        <LiveFeed compact />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {checkins.data ? <HourlyChart data={checkins.data.hourly} fetching={checkins.isFetching} /> : <Skeleton className="h-[320px] rounded-xl" />}
        <Card>
          <CardHeader title={t('Fins d’abonnement cette semaine')} description={t('À appeler pour le renouvellement')} />
          {expiring.data && expiring.data.length === 0 && <EmptyState title={t('Aucun abonnement ne se termine cette semaine')} />}
          <ul className="divide-y divide-line px-2 pb-2">
            {expiring.data?.map((item) => (
              <li key={item.memberId}>
                <Link to={`/admin/membres/${item.memberId}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-[var(--hover-wash)]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{fullName(item)}</p>
                    <p className="truncate text-xs text-muted">
                      {[item.planName, t('fin le {date}', { date: formatDate(item.endDate) }), item.phone].filter(Boolean).join(', ')}
                    </p>
                  </div>
                  <Badge tone={item.daysLeft <= 2 ? 'bad' : 'warn'}>{item.daysLeft <= 0 ? t('Aujourd’hui') : t('J-{n}', { n: item.daysLeft })}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <MembersBlock />
      <TeamBlock />

      <section aria-labelledby="ops-title" className="flex flex-col gap-3">
        <h2 id="ops-title" className="text-[15px] font-semibold text-fg">
          {t('Opérations')}
        </h2>
        <OperationsRow />
      </section>
    </div>
  );
}
