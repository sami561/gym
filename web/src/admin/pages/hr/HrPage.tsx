import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, LogIn, LogOut, Pencil, Plus, Trash2, Wallet, X } from 'lucide-react';
import clsx from 'clsx';
import { attendanceApi, employeesApi, leavesApi, payrollApi } from '../../../api/endpoints-ops';
import { usersApi } from '../../../api/endpoints';
import { errorMessage } from '../../../api/client';
import { useAuth } from '../../../api/auth';
import type { PaymentMethod } from '../../../api/types';
import type { EmployeeDto, LeaveStatus, PayrollDto } from '../../../api/types-ops';
import { Badge } from '../../../components/ui/Badge';
import { Button, IconButton } from '../../../components/ui/Button';
import { Card, CardHeader, EmptyState, ErrorNote, PageHeader } from '../../../components/ui/Card';
import { DataTable } from '../../../components/ui/DataTable';
import { Input } from '../../../components/ui/Field';
import { enumOptions, FormModal, type FieldDef } from '../../../components/ui/FormModal';
import { useConfirm } from '../../../components/ui/Modal';
import { Tabs } from '../../../components/ui/Tabs';
import { useToast } from '../../../components/ui/Toast';
import { formatDate, formatNumber, formatTime, formatTND, fullName, isoDay, monthLabel, PAYMENT_METHOD_LABELS } from '../../../lib/format';
import { CONTRACT_LABELS, LEAVE_STATUS, LEAVE_TYPE_LABELS, POSITION_LABELS, SALARY_TYPE_LABELS } from '../../../lib/labels-ops';
import { usePositionColor } from './team';
import { useI18n } from '../../../i18n';

type TabKey = 'employees' | 'clock' | 'leaves' | 'payroll';

function useEmployees() {
  return useQuery({ queryKey: ['employees', 'all'], queryFn: () => employeesApi.list() });
}

function EmployeesTab() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const color = usePositionColor();
  const [editing, setEditing] = useState<EmployeeDto | 'new' | null>(null);
  const employees = useEmployees();
  const users = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list() });
  const accounts = (users.data ?? []).filter((u) => u.role !== 'MEMBER').map((u) => ({ value: u.id, label: `${fullName(u)} (${u.email})` }));
  const fields: FieldDef[] = [
    { name: 'firstName', label: 'Prénom', required: true },
    { name: 'lastName', label: 'Nom', required: true },
    { name: 'position', label: 'Poste', type: 'select', required: true, options: enumOptions(POSITION_LABELS) },
    { name: 'contractType', label: 'Contrat', type: 'select', required: true, options: enumOptions(CONTRACT_LABELS) },
    { name: 'hireDate', label: 'Date d’embauche', type: 'date', required: true },
    { name: 'endDate', label: 'Fin de contrat', type: 'date' },
    { name: 'salaryType', label: 'Rémunération', type: 'select', required: true, options: enumOptions(SALARY_TYPE_LABELS) },
    { name: 'baseSalary', label: 'Montant (DT)', type: 'number', required: true, min: 0, step: 0.001, hint: 'Salaire mensuel, taux horaire ou prix par séance' },
    { name: 'commissionRate', label: 'Commission coaching privé (0 à 1)', type: 'number', min: 0, max: 1, step: 0.01 },
    { name: 'phone', label: 'Téléphone', type: 'tel' },
    { name: 'email', label: 'E-mail', type: 'email' },
    { name: 'cin', label: 'N° CIN' },
    { name: 'cnssNumber', label: 'N° CNSS' },
    { name: 'rib', label: 'RIB', wide: true },
    { name: 'userId', label: 'Compte back-office lié', type: 'select', options: accounts },
    ...(editing !== 'new' ? [{ name: 'status', label: 'Statut' as const, type: 'select' as const, required: true, options: [{ value: 'ACTIVE', label: 'Actif' }, { value: 'INACTIVE', label: 'Parti' }] }] : []),
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];

  return (
    <Card>
      <CardHeader
        title={t('Employés')}
        actions={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            {t('Nouvel employé')}
          </Button>
        }
      />
      {employees.isError && <ErrorNote message={errorMessage(employees.error)} onRetry={() => employees.refetch()} />}
      <DataTable
        rows={employees.data}
        rowKey={(e) => e.id}
        loading={employees.isLoading}
        empty={<EmptyState title={t('Aucun employé')} description={t('Ajoutez l’équipe d’accueil, les coachs et l’entretien.')} />}
        columns={[
          {
            key: 'name',
            header: 'Employé',
            cell: (e) => (
              <div className="flex items-center gap-2.5">
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: color(e.position) }} aria-hidden />
                <div>
                  <p className="font-medium">{fullName(e)}</p>
                  <p className="text-xs text-muted">{e.phone ?? e.email ?? ''}</p>
                </div>
              </div>
            ),
          },
          { key: 'position', header: 'Poste', cell: (e) => t(POSITION_LABELS[e.position]) },
          { key: 'contract', header: 'Contrat', hideOnMobile: true, cell: (e) => t('{contract} depuis le {date}', { contract: t(CONTRACT_LABELS[e.contractType]), date: formatDate(e.hireDate) }) },
          { key: 'pay', header: 'Rémunération', hideOnMobile: true, align: 'right', cell: (e) => `${formatTND(e.baseSalary)} ${e.salaryType === 'HOURLY' ? t('/ h') : e.salaryType === 'PER_SESSION' ? t('/ séance') : t('/ mois')}` },
          { key: 'status', header: 'Statut', cell: (e) => (e.status === 'ACTIVE' ? <Badge tone="good">{t('Actif')}</Badge> : <Badge>{t('Parti')}</Badge>) },
          {
            key: 'actions',
            header: <span className="sr-only">{t('Actions')}</span>,
            align: 'right',
            cell: (e) => (
              <div className="flex justify-end gap-1">
                <IconButton label={t('Modifier {name}', { name: fullName(e) })} onClick={() => setEditing(e)}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton
                  label={t('Supprimer {name}', { name: fullName(e) })}
                  onClick={async () => {
                    if (!(await confirm({ title: t('Supprimer {name} ?', { name: fullName(e) }), message: t('Préférez le statut « Parti » pour garder l’historique de paie.'), confirmLabel: t('Supprimer'), danger: true }))) return;
                    try {
                      await employeesApi.remove(e.id);
                      void queryClient.invalidateQueries({ queryKey: ['employees'] });
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            ),
          },
        ]}
      />
      <FormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('Nouvel employé') : t('Modifier l’employé')}
        submitLabel={t('Enregistrer')}
        size="xl"
        fields={fields}
        initial={editing === 'new' || !editing ? { position: 'RECEPTION', contractType: 'CDI', salaryType: 'MONTHLY', hireDate: isoDay(), commissionRate: 0 } : { ...editing }}
        onSubmit={async (v) => {
          if (editing === 'new') await employeesApi.create(v);
          else if (editing) await employeesApi.update(editing.id, v);
          toast.success(t('Employé enregistré.'));
          void queryClient.invalidateQueries({ queryKey: ['employees'] });
        }}
      />
    </Card>
  );
}

function ClockTab() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const color = usePositionColor();
  const employees = useEmployees();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const today = useQuery({
    queryKey: ['attendance', 'today'],
    queryFn: () => attendanceApi.list({ from: start.toISOString(), to: new Date(start.getTime() + 86_400_000).toISOString() }),
    refetchInterval: 30_000,
  });
  const [busy, setBusy] = useState<string | null>(null);

  const open = (employeeId: string) => today.data?.find((a) => a.employeeId === employeeId && !a.clockOut);
  const clock = async (e: EmployeeDto) => {
    setBusy(e.id);
    try {
      if (open(e.id)) {
        await attendanceApi.clockOut(e.id);
        toast.success(t('Départ de {name} enregistré.', { name: fullName(e) }));
      } else {
        const a = await attendanceApi.clockIn(e.id);
        toast.success(
          a.lateMinutes
            ? t('Arrivée de {name} à {time}, {late} min de retard.', { name: fullName(e), time: formatTime(a.clockIn), late: a.lateMinutes })
            : t('Arrivée de {name} à {time}.', { name: fullName(e), time: formatTime(a.clockIn) }),
        );
      }
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'team'] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-2">{t('Chaque employé touche son nom en arrivant et en partant. Les retards sont calculés d’après le planning.')}</p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {(employees.data ?? [])
          .filter((e) => e.status === 'ACTIVE')
          .map((e) => {
            const current = open(e.id);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  disabled={busy === e.id}
                  onClick={() => void clock(e)}
                  className={clsx(
                    'flex w-full items-center gap-4 rounded-xl p-4 text-start ring-1 transition-[box-shadow,transform] active:scale-[0.98] disabled:opacity-60',
                    current ? 'bg-[#0ca30c]/10 ring-[#0ca30c]/40' : 'bg-card ring-line hover:ring-fg-2/40',
                  )}
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full text-white" style={{ background: color(e.position) }}>
                    {current ? <LogOut className="size-5" aria-hidden /> : <LogIn className="size-5" aria-hidden />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-fg">{fullName(e)}</span>
                    <span className="block text-sm text-fg-2">
                      {current ? t('Présent depuis {time}, toucher pour partir', { time: formatTime(current.clockIn) }) : t('{position}, toucher pour arriver', { position: t(POSITION_LABELS[e.position]) })}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
      </ul>
      <Card>
        <CardHeader title={t('Pointages du jour')} />
        <DataTable
          rows={today.data}
          rowKey={(a) => a.id}
          loading={today.isLoading}
          empty={<EmptyState title={t('Personne n’a encore pointé aujourd’hui')} />}
          columns={[
            { key: 'name', header: 'Employé', cell: (a) => a.employeeName },
            { key: 'in', header: 'Arrivée', cell: (a) => formatTime(a.clockIn) },
            { key: 'out', header: 'Départ', cell: (a) => (a.clockOut ? formatTime(a.clockOut) : <Badge tone="good">{t('Présent')}</Badge>) },
            { key: 'late', header: 'Retard', cell: (a) => (a.lateMinutes ? <Badge tone="warn">{t('{n} min', { n: a.lateMinutes })}</Badge> : '—') },
            { key: 'worked', header: 'Durée', align: 'right', cell: (a) => (a.minutes !== null ? `${Math.floor(a.minutes / 60)}:${String(a.minutes % 60).padStart(2, '0')}` : '—') },
          ]}
        />
      </Card>
    </div>
  );
}

function LeavesTab() {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<LeaveStatus | ''>('PENDING');
  const [creating, setCreating] = useState(false);
  const employees = useEmployees();
  const leaves = useQuery({ queryKey: ['leaves', status], queryFn: () => leavesApi.list({ status: status || undefined }) });
  const decide = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      await leavesApi.decide(id, decision);
      toast.success(decision === 'APPROVED' ? t('Congé accepté.') : t('Congé refusé.'));
      void queryClient.invalidateQueries({ queryKey: ['leaves'] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <Card>
      <CardHeader
        title={t('Congés et absences')}
        actions={
          <>
            <Tabs
              value={status}
              onChange={setStatus}
              items={[
                { key: 'PENDING' as LeaveStatus | '', label: 'À valider' },
                { key: 'APPROVED', label: 'Acceptés' },
                { key: 'REJECTED', label: 'Refusés' },
                { key: '', label: 'Tous' },
              ]}
            />
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              {t('Demande de congé')}
            </Button>
          </>
        }
      />
      {leaves.isError && <ErrorNote message={errorMessage(leaves.error)} onRetry={() => leaves.refetch()} />}
      <DataTable
        rows={leaves.data}
        rowKey={(l) => l.id}
        loading={leaves.isLoading}
        empty={<EmptyState title={status === 'PENDING' ? t('Aucune demande à valider') : t('Aucun congé')} />}
        columns={[
          { key: 'who', header: 'Employé', cell: (l) => l.employeeName },
          { key: 'type', header: 'Type', cell: (l) => t(LEAVE_TYPE_LABELS[l.type]) },
          { key: 'period', header: 'Période', cell: (l) => t('{from} → {to} ({days} j)', { from: formatDate(l.from), to: formatDate(l.to), days: l.days }) },
          { key: 'reason', header: 'Motif', hideOnMobile: true, cell: (l) => l.reason ?? '—' },
          { key: 'status', header: 'Statut', cell: (l) => <Badge tone={LEAVE_STATUS[l.status].tone}>{t(LEAVE_STATUS[l.status].label)}</Badge> },
          {
            key: 'actions',
            header: <span className="sr-only">{t('Actions')}</span>,
            align: 'right',
            cell: (l) =>
              l.status === 'PENDING' && user?.role === 'ADMIN' ? (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="secondary" icon={<Check className="size-3.5" />} onClick={() => void decide(l.id, 'APPROVED')}>
                    {t('Accepter')}
                  </Button>
                  <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => void decide(l.id, 'REJECTED')}>
                    {t('Refuser')}
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-muted">{l.decidedByName ?? ''}</span>
              ),
          },
        ]}
      />
      <FormModal
        open={creating}
        onClose={() => setCreating(false)}
        title={t('Demande de congé')}
        submitLabel={t('Enregistrer la demande')}
        size="md"
        fields={[
          { name: 'employeeId', label: 'Employé', type: 'select', required: true, options: (employees.data ?? []).filter((e) => e.status === 'ACTIVE').map((e) => ({ value: e.id, label: fullName(e) })) },
          { name: 'type', label: 'Type', type: 'select', required: true, options: enumOptions(LEAVE_TYPE_LABELS) },
          { name: 'from', label: 'Du', type: 'date', required: true },
          { name: 'to', label: 'Au', type: 'date', required: true },
          { name: 'reason', label: 'Motif', type: 'textarea' },
        ]}
        initial={{ type: 'ANNUAL', from: isoDay(), to: isoDay() }}
        onSubmit={async (v) => {
          if (String(v.to) < String(v.from)) throw new Error(t('La date de fin doit être après la date de début.'));
          await leavesApi.create(v);
          toast.success(t('Demande enregistrée.'));
          void queryClient.invalidateQueries({ queryKey: ['leaves'] });
        }}
      />
    </Card>
  );
}

function previousMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function PayrollTab() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [period, setPeriod] = useState(previousMonth);
  const [editing, setEditing] = useState<PayrollDto | null>(null);
  const [paying, setPaying] = useState<PayrollDto | null>(null);
  const [generating, setGenerating] = useState(false);
  const payroll = useQuery({ queryKey: ['payroll', period], queryFn: () => payrollApi.list(period) });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['payroll'] });
  const total = (payroll.data ?? []).reduce((sum, p) => sum + p.netAmount, 0);

  const generate = async () => {
    if (payroll.data?.length && !(await confirm({ title: t('Recalculer la paie de {month} ?', { month: monthLabel(period, true) }), message: t('Les fiches en brouillon sont recalculées ; les fiches payées ne changent pas.'), confirmLabel: t('Recalculer') }))) return;
    setGenerating(true);
    try {
      const rows = await payrollApi.generate(period);
      toast.success(t('{n} fiches de paie calculées.', { n: rows.length }));
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={t('Paie')}
        description={payroll.data?.length ? t('Total net du mois : {total}', { total: formatTND(total) }) : t('Calculée à partir des contrats, des heures pointées et des séances de coaching.')}
        actions={
          <>
            <Input type="month" aria-label={t('Mois')} value={period} onChange={(e) => setPeriod(e.target.value)} className="w-44" />
            <Button size="sm" icon={<Wallet className="size-4" />} loading={generating} onClick={() => void generate()}>
              {payroll.data?.length ? t('Recalculer') : t('Générer la paie du mois')}
            </Button>
          </>
        }
      />
      {payroll.isError && <ErrorNote message={errorMessage(payroll.error)} onRetry={() => payroll.refetch()} />}
      <DataTable
        rows={payroll.data}
        rowKey={(p) => p.id}
        loading={payroll.isLoading}
        empty={<EmptyState title={t('Pas encore de paie pour {month}', { month: monthLabel(period, true) })} description={t('Générez les fiches : elles restent modifiables tant qu’elles ne sont pas payées.')} />}
        columns={[
          { key: 'who', header: 'Employé', cell: (p) => <span className="font-medium">{p.employeeName}</span> },
          { key: 'base', header: 'Base', align: 'right', cell: (p) => formatTND(p.baseAmount) },
          { key: 'activity', header: 'Activité', hideOnMobile: true, align: 'right', cell: (p) => t('{hours} h, {sessions} séances', { hours: formatNumber(p.hoursWorked), sessions: p.sessions }) },
          { key: 'extras', header: 'Commissions et primes', hideOnMobile: true, align: 'right', cell: (p) => formatTND(p.commissions + p.bonuses) },
          { key: 'deductions', header: 'Retenues', hideOnMobile: true, align: 'right', cell: (p) => (p.deductions ? `−${formatTND(p.deductions)}` : '—') },
          { key: 'net', header: 'Net', align: 'right', cell: (p) => <span className="font-semibold">{formatTND(p.netAmount)}</span> },
          { key: 'status', header: 'Statut', cell: (p) => (p.status === 'PAID' ? <Badge tone="good">{p.paidAt ? t('Payé le {date}', { date: formatDate(p.paidAt, { day: 'numeric', month: 'short' }) }) : t('Payé')}</Badge> : <Badge tone="warn">{t('Brouillon')}</Badge>) },
          {
            key: 'actions',
            header: <span className="sr-only">{t('Actions')}</span>,
            align: 'right',
            cell: (p) =>
              p.status === 'DRAFT' && (
                <div className="flex justify-end gap-1">
                   <IconButton label={t('Ajuster la paie de {name}', { name: p.employeeName })} onClick={() => setEditing(p)}>
                    <Pencil className="size-4" />
                  </IconButton>
                  <Button size="sm" variant="secondary" onClick={() => setPaying(p)}>
                    {t('Marquer payé')}
                  </Button>
                </div>
              ),
          },
        ]}
      />
      <FormModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? t('Ajuster la paie de {name}', { name: editing.employeeName }) : ''}
        submitLabel={t('Enregistrer')}
        size="md"
        fields={[
          { name: 'commissions', label: 'Commissions (DT)', type: 'number', min: 0, step: 0.001 },
          { name: 'bonuses', label: 'Primes (DT)', type: 'number', min: 0, step: 0.001 },
          { name: 'deductions', label: 'Retenues (DT)', type: 'number', min: 0, step: 0.001, hint: 'Avances, absences non payées…' },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ]}
        initial={editing ? { ...editing } : {}}
        onSubmit={async (v) => {
          if (!editing) return;
          await payrollApi.update(editing.id, { commissions: v.commissions ?? 0, bonuses: v.bonuses ?? 0, deductions: v.deductions ?? 0, notes: v.notes });
          toast.success(t('Paie ajustée.'));
          refresh();
        }}
      />
      <FormModal
        open={Boolean(paying)}
        onClose={() => setPaying(null)}
        title={paying ? t('Payer {name} : {amount}', { name: paying.employeeName, amount: formatTND(paying.netAmount) }) : ''}
        description={t('Le salaire est aussi enregistré dans les dépenses du mois.')}
        submitLabel={t('Confirmer le paiement')}
        size="sm"
        fields={[{ name: 'method', label: 'Moyen de paiement', type: 'select', required: true, options: enumOptions(PAYMENT_METHOD_LABELS) }]}
        initial={{ method: 'TRANSFER' }}
        onSubmit={async (v) => {
          if (!paying) return;
          await payrollApi.pay(paying.id, v.method as PaymentMethod);
          toast.success(t('Salaire marqué comme payé.'));
          refresh();
        }}
      />
    </Card>
  );
}

export function HrPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [tab, setTab] = useState<TabKey>('employees');
  return (
    <div>
      <PageHeader
        title={t('Employés')}
        description={t('Contrats, pointage, congés et paie de l’équipe.')}
        actions={
          <Link to="/admin/calendrier-equipe" className="inline-flex h-10 items-center gap-2 rounded-lg bg-card-2 px-4 text-sm font-semibold text-fg ring-1 ring-line hover:ring-fg-2/40">
            <CalendarDays className="size-4" aria-hidden />
            {t('Calendrier de l’équipe')}
          </Link>
        }
      />
      <Tabs
        className="mb-5 w-fit"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'employees', label: 'Employés' },
          { key: 'clock', label: 'Pointage' },
          { key: 'leaves', label: 'Congés' },
          ...(user?.role === 'ADMIN' ? [{ key: 'payroll' as const, label: 'Paie' as const }] : []),
        ]}
      />
      {tab === 'employees' && <EmployeesTab />}
      {tab === 'clock' && <ClockTab />}
      {tab === 'leaves' && <LeavesTab />}
      {tab === 'payroll' && user?.role === 'ADMIN' && <PayrollTab />}
    </div>
  );
}
