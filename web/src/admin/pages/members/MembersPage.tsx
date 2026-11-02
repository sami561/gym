import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, Users } from 'lucide-react';
import { membersApi, plansApi } from '../../../api/endpoints';
import { errorMessage } from '../../../api/client';
import type { CreateMemberRequest, CreateMemberResult, MemberListItem, MemberStatusFilter, PaymentMethod } from '../../../api/types';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, EmptyState, ErrorNote, PageHeader } from '../../../components/ui/Card';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { Checkbox, Input, SearchInput, Select, Textarea } from '../../../components/ui/Field';
import { Modal } from '../../../components/ui/Modal';
import { Pagination } from '../../../components/ui/Pagination';
import { Tabs } from '../../../components/ui/Tabs';
import { useToast } from '../../../components/ui/Toast';
import { formatDate, formatTND, fullName, PAYMENT_METHOD_LABELS } from '../../../lib/format';
import { PromoField, usePromoQuote } from './PromoField';
import { useI18n, type TKey } from '../../../i18n';

const STATUS_TABS: { key: MemberStatusFilter; label: TKey }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'active', label: 'Actifs' },
  { key: 'expired', label: 'Expirés' },
  { key: 'suspended', label: 'Suspendus' },
];

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function MembershipBadge({ member }: { member: MemberListItem }) {
  const { t } = useI18n();
  if (member.status === 'SUSPENDED') return <Badge tone="bad">{t('Suspendu')}</Badge>;
  if (member.membership.active) return <Badge tone="good">{t('Actif')}</Badge>;
  return <Badge tone="neutral">{t('Sans abonnement')}</Badge>;
}

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  birthDate: '',
  gender: '',
  emergencyContact: '',
  notes: '',
  password: '',
  planId: '',
  promoCode: '',
  withPayment: true,
  method: 'CASH' as PaymentMethod,
  reference: '',
};

function CreateMemberModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (result: CreateMemberResult) => void }) {
  const { t } = useI18n();
  const plans = useQuery({ queryKey: ['plans', 'all'], queryFn: () => plansApi.list(false), enabled: open });
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const plan = plans.data?.find((p) => p.id === form.planId);
  const quote = usePromoQuote(form.promoCode, form.planId);

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
      setError(null);
    }
  }, [open]);

  const set = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: CreateMemberRequest = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        birthDate: form.birthDate || null,
        gender: (form.gender || null) as CreateMemberRequest['gender'],
        emergencyContact: form.emergencyContact.trim() || null,
        notes: form.notes.trim() || null,
        password: form.password || undefined,
      };
      const payment = form.withPayment ? { method: form.method, reference: form.reference.trim() || undefined } : undefined;
      // Promo codes apply to subscriptions only: with a code, subscribe in a second call.
      const promoCode = quote.data?.code;
      if (form.planId && !promoCode) {
        body.planId = form.planId;
        body.payment = payment;
      }
      const result = await membersApi.create(body);
      if (form.planId && promoCode) {
        try {
          result.subscription = await membersApi.subscribe(result.member.id, { planId: form.planId, promoCode, payment });
        } catch (err) {
          onCreated(result);
          throw new Error(t('Membre créé, mais l’abonnement n’a pas pu être enregistré : {error} Ajoutez-le depuis sa fiche.', { error: errorMessage(err) }));
        }
      }
      onCreated(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const price = quote.data?.price ?? plan?.price;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Nouveau membre')}
      description={t('Le membre recevra un e-mail de bienvenue et pourra se connecter à l’application.')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Annuler')}
          </Button>
          <Button loading={saving} onClick={() => void submit()} disabled={!form.firstName || !form.lastName || !form.email}>
            {t('Créer le membre')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={`${t('Prénom')} *`} required value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
          <Input label={`${t('Nom')} *`} required value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
          <Input label={`${t('E-mail')} *`} type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} />
          <Input label={t('Téléphone')} type="tel" placeholder="+216" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          <Input label={t('Date de naissance')} type="date" value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
          <Select label={t('Genre')} value={form.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="">—</option>
            <option value="FEMALE">{t('Femme')}</option>
            <option value="MALE">{t('Homme')}</option>
          </Select>
          <Input label={t('Contact d’urgence')} value={form.emergencyContact} onChange={(e) => set('emergencyContact', e.target.value)} wrapperClassName="sm:col-span-2" />
          <Input
            label={t('Mot de passe de l’application')}
            type="text"
            autoComplete="off"
            hint={t('Laissez vide : un mot de passe provisoire sera généré et affiché une seule fois.')}
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            wrapperClassName="sm:col-span-2"
          />
        </div>

        <fieldset className="rounded-xl bg-page p-4 ring-1 ring-line">
          <legend className="px-1 text-sm font-semibold text-fg">{t('Abonnement')}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label={t('Offre')} value={form.planId} onChange={(e) => set('planId', e.target.value)} wrapperClassName="sm:col-span-2">
              <option value="">{t('Pas d’abonnement pour l’instant')}</option>
              {plans.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}, {formatTND(p.price)}
                </option>
              ))}
            </Select>
            {form.planId && (
              <>
                <PromoField value={form.promoCode} onChange={(v) => set('promoCode', v)} quote={quote} />
                <div className="flex flex-col justify-end text-sm text-fg-2">
                  <span>{t('À payer')}</span>
                  <span className="text-xl font-semibold text-fg">{formatTND(price)}</span>
                </div>
                <div className="sm:col-span-2">
                  <Checkbox label={t('Encaisser le paiement maintenant')} checked={form.withPayment} onChange={(v) => set('withPayment', v)} />
                </div>
                {form.withPayment && (
                  <>
                    <Select label={t('Moyen de paiement')} value={form.method} onChange={(e) => set('method', e.target.value as PaymentMethod)}>
                      {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((value) => (
                        <option key={value} value={value}>
                          {t(PAYMENT_METHOD_LABELS[value])}
                        </option>
                      ))}
                    </Select>
                    <Input label={t('Référence')} placeholder={t('N° de reçu, de transaction…')} value={form.reference} onChange={(e) => set('reference', e.target.value)} />
                  </>
                )}
              </>
            )}
          </div>
        </fieldset>

        <Textarea label={t('Notes internes')} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        {error && <ErrorNote message={error} />}
      </div>
    </Modal>
  );
}

function CreatedModal({ result, onClose }: { result: CreateMemberResult | null; onClose: () => void }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  return (
    <Modal
      open={Boolean(result)}
      onClose={onClose}
      title={t('Membre créé')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Fermer')}
          </Button>
          <Button onClick={() => result && navigate(`/admin/membres/${result.member.id}`)}>{t('Ouvrir la fiche')}</Button>
        </>
      }
    >
      {result && (
        <div className="flex flex-col gap-4 text-sm text-fg-2">
          <p>{t('{name} est inscrit sous le code {code}.', { name: fullName(result.member), code: result.member.memberCode })}</p>
          {result.temporaryPassword && (
            <div className="rounded-xl bg-page p-4 ring-1 ring-line">
              <p className="flex items-center gap-2 font-semibold text-fg">
                <KeyRound className="size-4" aria-hidden />
                {t('Mot de passe provisoire')}
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-wide text-fg select-all">{result.temporaryPassword}</p>
              <p className="mt-2 text-xs text-muted">{t('Affiché une seule fois. Donnez-le au membre pour sa première connexion à l’application.')}</p>
            </div>
          )}
          {result.subscription && (
            <p>{t('Abonnement {plan} du {from} au {to}.', { plan: result.subscription.plan.name, from: formatDate(result.subscription.startDate), to: formatDate(result.subscription.endDate) })}</p>
          )}
        </div>
      )}
    </Modal>
  );
}

export function MembersPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<MemberStatusFilter>('all');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreateMemberResult | null>(null);
  const debounced = useDebounced(search);
  const pageSize = 20;

  useEffect(() => setPage(1), [debounced, status]);

  const query = useQuery({
    queryKey: ['members', debounced, status, page],
    queryFn: () => membersApi.list({ search: debounced || undefined, status, page, pageSize }),
    placeholderData: keepPreviousData,
  });

  const columns: Column<MemberListItem>[] = [
    {
      key: 'name',
      header: 'Membre',
      cell: (m) => (
        <div className="min-w-0">
          <p className="font-medium text-fg">{fullName(m)}</p>
          <p className="text-xs text-muted">{m.memberCode}</p>
        </div>
      ),
    },
    { key: 'contact', header: 'Contact', hideOnMobile: true, cell: (m) => <div className="text-fg-2"><p>{m.phone ?? '—'}</p><p className="text-xs text-muted">{m.email}</p></div> },
    { key: 'plan', header: 'Offre', hideOnMobile: true, cell: (m) => m.membership.planName ?? <span className="text-muted">—</span> },
    { key: 'end', header: 'Fin', hideOnMobile: true, cell: (m) => (m.membership.endDate ? formatDate(m.membership.endDate) : <span className="text-muted">—</span>) },
    { key: 'status', header: 'Statut', cell: (m) => <MembershipBadge member={m} /> },
  ];

  return (
    <div>
      <PageHeader
        title={t('Membres')}
        description={t('Inscriptions, abonnements, paiements et badges d’accès.')}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            {t('Nouveau membre')}
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder={t('Nom, e-mail, téléphone ou code membre')} className="w-full sm:w-96" />
        <Tabs items={STATUS_TABS} value={status} onChange={setStatus} />
      </div>
      {query.isError && <ErrorNote message={errorMessage(query.error)} onRetry={() => query.refetch()} />}
      <Card>
        <DataTable
          columns={columns}
          rows={query.data?.items}
          rowKey={(m) => m.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          onRowClick={(m) => navigate(`/admin/membres/${m.id}`)}
          caption={t('Liste des membres')}
          empty={
            <EmptyState
              icon={<Users className="size-8" />}
              title={debounced ? t('Aucun membre ne correspond') : t('Aucun membre pour l’instant')}
              description={debounced ? t('Vérifiez l’orthographe ou cherchez par numéro de téléphone.') : t('Inscrivez le premier membre de la salle.')}
            />
          }
        />
        {query.data && query.data.total > pageSize && (
          <Pagination page={page} pageSize={pageSize} total={query.data.total} onChange={setPage} />
        )}
      </Card>

      <CreateMemberModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(result) => {
          setCreating(false);
          setCreated(result);
          toast.success(t('{name} est inscrit.', { name: fullName(result.member) }));
          void queryClient.invalidateQueries({ queryKey: ['members'] });
          void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        }}
      />
      <CreatedModal result={created} onClose={() => setCreated(null)} />
    </div>
  );
}
