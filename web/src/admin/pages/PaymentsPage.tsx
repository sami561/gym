import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { paymentsApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import type { PaymentMethod } from '../../api/types';
import { Card, EmptyState, ErrorNote, PageHeader } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { Input, Select } from '../../components/ui/Field';
import { Pagination } from '../../components/ui/Pagination';
import { addDays, formatDateTime, formatInt, formatTND, isoDay, PAYMENT_METHOD_LABELS } from '../../lib/format';
import { useI18n } from '../../i18n';

function monthStart(): string {
  const d = new Date();
  return isoDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function PaymentsPage() {
  const { t } = useI18n();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoDay());
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const query = useQuery({
    queryKey: ['payments', from, to, method, page],
    // `to` is inclusive for the user: send the next day at midnight.
    queryFn: () =>
      paymentsApi.list({
        from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
        to: to ? addDays(new Date(`${to}T00:00:00`), 1).toISOString() : undefined,
        method,
        page,
        pageSize,
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader title={t('Paiements')} description={t('Tous les encaissements d’abonnements, filtrables par période et moyen de paiement.')} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input label={t('Du')} type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} wrapperClassName="w-40" />
        <Input label={t('Au')} type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} wrapperClassName="w-40" />
         <Select label={t('Moyen')} value={method} onChange={(e) => { setMethod(e.target.value as PaymentMethod | ''); setPage(1); }} wrapperClassName="w-44">
          <option value="">{t('Tous')}</option>
          {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((value) => (
            <option key={value} value={value}>
              {t(PAYMENT_METHOD_LABELS[value])}
            </option>
          ))}
        </Select>
        {query.data && (
          <div className="ms-auto rounded-xl bg-card px-5 py-3 ring-1 ring-line">
            <p className="text-xs text-muted">{t('{n} paiements sur la période', { n: formatInt(query.data.total) })}</p>
            <p className="text-xl font-semibold text-fg">{formatTND(query.data.sum)}</p>
          </div>
        )}
      </div>
      {query.isError && <ErrorNote message={errorMessage(query.error)} onRetry={() => query.refetch()} />}
      <Card>
        <DataTable
          rows={query.data?.items}
          rowKey={(p) => p.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          empty={<EmptyState icon={<Receipt className="size-8" />} title={t('Aucun paiement sur cette période')} description={t('Élargissez les dates ou retirez le filtre de moyen de paiement.')} />}
          columns={[
            { key: 'date', header: 'Date', cell: (p) => formatDateTime(p.paidAt) },
            {
              key: 'member',
              header: 'Membre',
              cell: (p) => (
                <Link to={`/admin/membres/${p.memberId}`} className="font-medium hover:underline">
                  {p.memberName}
                  <span className="block text-xs font-normal text-muted">{p.memberCode}</span>
                </Link>
              ),
            },
            { key: 'plan', header: 'Objet', hideOnMobile: true, cell: (p) => p.planName ?? t('Paiement libre') },
            { key: 'method', header: 'Moyen', cell: (p) => t(PAYMENT_METHOD_LABELS[p.method]) },
            { key: 'by', header: 'Encaissé par', hideOnMobile: true, cell: (p) => p.receivedByName ?? '—' },
            { key: 'amount', header: 'Montant', align: 'right', cell: (p) => <span className="font-semibold">{formatTND(p.amount)}</span> },
          ]}
        />
        {query.data && query.data.total > pageSize && <Pagination page={page} pageSize={pageSize} total={query.data.total} onChange={setPage} />}
      </Card>
    </div>
  );
}
