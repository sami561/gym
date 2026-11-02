import { useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import { expensesApi, financeApi } from '../../api/endpoints-ops';
import { errorMessage } from '../../api/client';
import type { ExpenseCategory, ExpenseDto } from '../../api/types-ops';
import { Badge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, CardHeader, EmptyState, ErrorNote, PageHeader } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { Input, Select } from '../../components/ui/Field';
import { enumOptions, FormModal, type FieldDef } from '../../components/ui/FormModal';
import { useConfirm } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Spinner';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import { useI18n } from '../../i18n';
import { formatDate, formatTND, isoDay, PAYMENT_METHOD_LABELS } from '../../lib/format';
import { EXPENSE_CATEGORY_LABELS } from '../../lib/labels-ops';
import { CategoryBarsChart, ProfitChart, RevenueExpensesChart } from '../charts/Charts';
import { StatTile } from '../charts/StatTile';

const FIELDS: FieldDef[] = [
  { name: 'label', label: 'Libellé', required: true, placeholder: 'Loyer novembre' },
  { name: 'category', label: 'Catégorie', type: 'select', required: true, options: enumOptions(EXPENSE_CATEGORY_LABELS) },
  { name: 'amount', label: 'Montant (DT)', type: 'number', required: true, min: 0, step: 0.001 },
  { name: 'date', label: 'Date', type: 'date', required: true },
  { name: 'paymentMethod', label: 'Moyen de paiement', type: 'select', options: enumOptions(PAYMENT_METHOD_LABELS) },
  { name: 'supplier', label: 'Fournisseur' },
  { name: 'reference', label: 'Référence (facture…)', wide: true },
];

function monthStart(): string {
  const d = new Date();
  return isoDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function FinancePage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [months, setMonths] = useState<'6' | '12'>('12');
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(isoDay());
  const [category, setCategory] = useState<ExpenseCategory | ''>('');
  const [editing, setEditing] = useState<ExpenseDto | 'new' | null>(null);

  const summary = useQuery({ queryKey: ['finance', months], queryFn: () => financeApi.summary(Number(months)), placeholderData: keepPreviousData });
  const expenses = useQuery({ queryKey: ['expenses', from, to, category], queryFn: () => expensesApi.list({ from, to, category: category || undefined }) });
  const total = (expenses.data ?? []).reduce((sum, e) => sum + e.amount, 0);
  const thisMonth = summary.data?.thisMonth;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('Dépenses et résultats')}
        description={t('Recettes des abonnements et de la boutique, dépenses et résultat mois par mois.')}
        actions={
          <Tabs
            value={months}
            onChange={setMonths}
            items={[
              { key: '6', label: '6 mois' },
              { key: '12', label: '12 mois' },
            ]}
          />
        }
      />
      {summary.isError && <ErrorNote message={errorMessage(summary.error)} onRetry={() => summary.refetch()} />}

      <section aria-label={t('Ce mois-ci')} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t('Abonnements ce mois')} loading={!thisMonth} value={formatTND(thisMonth?.membershipRevenue)} />
        <StatTile label={t('Boutique ce mois')} loading={!thisMonth} value={formatTND(thisMonth?.salesRevenue)} />
        <StatTile label={t('Dépenses ce mois')} loading={!thisMonth} value={formatTND(thisMonth?.expenses)} />
        <StatTile
          label={t('Résultat ce mois')}
          loading={!thisMonth}
          value={formatTND(thisMonth?.profit)}
          status={thisMonth && thisMonth.profit < 0 ? <Badge tone="bad">{t('Perte')}</Badge> : undefined}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {summary.data ? <RevenueExpensesChart data={summary.data.months} fetching={summary.isFetching} /> : <Skeleton className="h-[340px] rounded-xl" />}
        {summary.data ? <ProfitChart data={summary.data.months} fetching={summary.isFetching} /> : <Skeleton className="h-[340px] rounded-xl" />}
      </div>
      {summary.data && summary.data.expensesByCategory.length > 0 && (
        <CategoryBarsChart
          title={t('Dépenses par catégorie')}
          subtitle={t('Sur la période affichée')}
          data={summary.data.expensesByCategory.map((e) => ({ label: t(EXPENSE_CATEGORY_LABELS[e.category]), value: e.total }))}
        />
      )}

      <Card>
        <CardHeader
          title={t('Dépenses')}
          description={t('Total sur la période : {total}', { total: formatTND(total) })}
          actions={
            <>
              <Input type="date" aria-label={t('Du')} value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
              <Input type="date" aria-label={t('Au')} value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
              <Select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory | '')} aria-label={t('Catégorie')} className="w-52">
                <option value="">{t('Toutes les catégories')}</option>
                {(Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {t(EXPENSE_CATEGORY_LABELS[c])}
                  </option>
                ))}
              </Select>
              <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
                {t('Nouvelle dépense')}
              </Button>
            </>
          }
        />
        {expenses.isError && <ErrorNote message={errorMessage(expenses.error)} onRetry={() => expenses.refetch()} />}
        <DataTable
          rows={expenses.data}
          rowKey={(e) => e.id}
          loading={expenses.isLoading}
          empty={<EmptyState icon={<Receipt className="size-8" />} title={t('Aucune dépense sur cette période')} />}
          columns={[
            { key: 'date', header: 'Date', cell: (e) => formatDate(e.date) },
            {
              key: 'label',
              header: 'Libellé',
              cell: (e) => (
                <div>
                  <p className="font-medium">{e.label}</p>
                  <p className="text-xs text-muted">{e.supplier ?? (e.source !== 'manual' ? t('Automatique') : '')}</p>
                </div>
              ),
            },
            { key: 'category', header: 'Catégorie', cell: (e) => t(EXPENSE_CATEGORY_LABELS[e.category]) },
            { key: 'method', header: 'Moyen de paiement', hideOnMobile: true, cell: (e) => (e.paymentMethod ? t(PAYMENT_METHOD_LABELS[e.paymentMethod]) : '—') },
            { key: 'amount', header: 'Montant', align: 'right', cell: (e) => <span className="font-semibold">{formatTND(e.amount)}</span> },
            {
              key: 'actions',
              header: <span className="sr-only">{t('Actions')}</span>,
              align: 'right',
              cell: (e) =>
                e.source === 'manual' && (
                  <div className="flex justify-end gap-1">
                    <IconButton label={t('Modifier')} onClick={() => setEditing(e)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton
                      label={t('Supprimer')}
                      onClick={async () => {
                        if (!(await confirm({ title: t('Supprimer cette dépense ?'), confirmLabel: t('Supprimer'), danger: true }))) return;
                        try {
                          await expensesApi.remove(e.id);
                          void queryClient.invalidateQueries({ queryKey: ['expenses'] });
                          void queryClient.invalidateQueries({ queryKey: ['finance'] });
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
      </Card>

      <FormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('Nouvelle dépense') : t('Modifier la dépense')}
        submitLabel={t('Enregistrer')}
        fields={FIELDS}
        initial={editing === 'new' || !editing ? { category: 'OTHER', date: isoDay(), paymentMethod: 'CASH' } : { ...editing }}
        onSubmit={async (v) => {
          if (editing === 'new') await expensesApi.create(v);
          else if (editing) await expensesApi.update(editing.id, v);
          toast.success(t('Dépense enregistrée.'));
          void queryClient.invalidateQueries({ queryKey: ['expenses'] });
          void queryClient.invalidateQueries({ queryKey: ['finance'] });
        }}
      />
    </div>
  );
}
