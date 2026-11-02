import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CreditCard, IdCard, Pause, Play, Plus, QrCode, RefreshCw, Ruler, Trash2 } from 'lucide-react';
import { membersApi, plansApi, subscriptionsApi } from '../../../api/endpoints';
import { measurementsApi } from '../../../api/endpoints-ops';
import { errorMessage } from '../../../api/client';
import { useAuth } from '../../../api/auth';
import type { MemberDetail, PaymentMethod, SubscriptionDto, SubscriptionStatus } from '../../../api/types';
import { Badge, type BadgeTone } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader, EmptyState, ErrorNote } from '../../../components/ui/Card';
import { DataTable } from '../../../components/ui/DataTable';
import { Checkbox, Input, Select, Textarea } from '../../../components/ui/Field';
import { FormModal } from '../../../components/ui/FormModal';
import { Modal, useConfirm } from '../../../components/ui/Modal';
import { PageSpinner } from '../../../components/ui/Spinner';
import { Tabs } from '../../../components/ui/Tabs';
import { useToast } from '../../../components/ui/Toast';
import {
  ACCESS_METHOD_LABELS,
  formatDate,
  formatDateTime,
  formatInt,
  formatTND,
  fullName,
  isoDay,
  PAYMENT_METHOD_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
} from '../../../lib/format';
import { WeightChart } from '../../charts/Charts';
import { PromoField, usePromoQuote } from './PromoField';
import { useI18n } from '../../../i18n';

type TabKey = 'membership' | 'payments' | 'access' | 'profile' | 'progress';

const SUB_TONES: Record<SubscriptionStatus, BadgeTone> = { ACTIVE: 'good', FROZEN: 'info', EXPIRED: 'neutral', CANCELLED: 'bad' };

const methodOptions = (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((value) => ({ value, label: PAYMENT_METHOD_LABELS[value] }));

function RenewModal({ member, open, onClose }: { member: MemberDetail; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const plans = useQuery({ queryKey: ['plans', 'all'], queryFn: () => plansApi.list(false), enabled: open });
  const [planId, setPlanId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [promo, setPromo] = useState('');
  const [pay, setPay] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const quote = usePromoQuote(promo, planId);
  const plan = plans.data?.find((p) => p.id === planId);

  useEffect(() => {
    if (open) {
      setPlanId(member.membership.current?.planId ?? '');
      setStartDate('');
      setPromo('');
      setPay(true);
      setReference('');
    }
  }, [open, member]);

  const mutation = useMutation({
    mutationFn: () =>
      membersApi.subscribe(member.member.id, {
        planId,
        startDate: startDate || undefined,
        promoCode: quote.data?.code,
        payment: pay ? { method, reference: reference.trim() || undefined } : undefined,
      }),
    onSuccess: (sub) => {
      toast.success(t('Abonnement {plan} enregistré jusqu’au {date}.', { plan: sub.plan.name, date: formatDate(sub.endDate) }));
      void queryClient.invalidateQueries({ queryKey: ['member', member.member.id] });
      void queryClient.invalidateQueries({ queryKey: ['members'] });
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Renouveler l’abonnement')}
      description={
        member.membership.validUntil
          ? t('Accès valable jusqu’au {date} : le nouvel abonnement démarre le lendemain par défaut.', { date: formatDate(member.membership.validUntil) })
          : t('Le nouvel abonnement démarre aujourd’hui par défaut.')
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Annuler')}
          </Button>
          <Button loading={mutation.isPending} disabled={!planId} onClick={() => mutation.mutate()}>
            {t('Enregistrer l’abonnement')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label={`${t('Offre')} *`} value={planId} onChange={(e) => setPlanId(e.target.value)} wrapperClassName="sm:col-span-2">
          <option value="">{t('Choisir…')}</option>
          {plans.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}, {formatTND(p.price)}
            </option>
          ))}
        </Select>
        <Input label={t('Début')} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} hint={t('Laisser vide pour la date automatique')} />
        <PromoField value={promo} onChange={setPromo} quote={quote} />
        <div className="sm:col-span-2">
          <p className="text-sm text-fg-2">{t('À payer')}</p>
          <p className="text-2xl font-semibold text-fg">{formatTND(quote.data?.price ?? plan?.price ?? 0)}</p>
        </div>
        <div className="sm:col-span-2">
          <Checkbox label={t('Encaisser le paiement maintenant')} checked={pay} onChange={setPay} />
        </div>
        {pay && (
          <>
            <Select label={t('Moyen de paiement')} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {methodOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.label)}
                </option>
              ))}
            </Select>
            <Input label={t('Référence')} value={reference} onChange={(e) => setReference(e.target.value)} />
          </>
        )}
        {mutation.isError && (
          <div className="sm:col-span-2">
            <ErrorNote message={errorMessage(mutation.error)} />
          </div>
        )}
      </div>
    </Modal>
  );
}

function SubscriptionActions({ sub, memberId }: { sub: SubscriptionDto; memberId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [freezing, setFreezing] = useState(false);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['member', memberId] });
    void queryClient.invalidateQueries({ queryKey: ['members'] });
  };

  const run = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action();
      toast.success(message);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="flex justify-end gap-1">
      {sub.status === 'ACTIVE' && (
        <Button size="sm" variant="ghost" icon={<Pause className="size-3.5" />} onClick={() => setFreezing(true)}>
          {t('Geler')}
        </Button>
      )}
      {sub.status === 'FROZEN' && (
        <Button size="sm" variant="ghost" icon={<Play className="size-3.5" />} onClick={() => void run(() => subscriptionsApi.unfreeze(sub.id), t('Abonnement réactivé, la date de fin a été repoussée.'))}>
          {t('Dégeler')}
        </Button>
      )}
      {(sub.status === 'ACTIVE' || sub.status === 'FROZEN') && (
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            const ok = await confirm({
              title: t('Annuler cet abonnement ?'),
              message: t('{plan}, du {from} au {to}. L’accès aux portes s’arrête immédiatement.', { plan: sub.plan.name, from: formatDate(sub.startDate), to: formatDate(sub.endDate) }),
              confirmLabel: t('Annuler l’abonnement'),
              danger: true,
            });
            if (ok) await run(() => subscriptionsApi.update(sub.id, { status: 'CANCELLED' }), t('Abonnement annulé.'));
          }}
        >
          {t('Annuler')}
        </Button>
      )}
      <FormModal
        open={freezing}
        onClose={() => setFreezing(false)}
        title={t('Geler l’abonnement')}
        description={t('L’accès est suspendu ; la date de fin est repoussée d’autant au dégel.')}
        size="sm"
        submitLabel={t('Geler l’abonnement')}
        fields={[
          { name: 'days', label: 'Nombre de jours', type: 'number', required: true, min: 1, max: 180, step: 1 },
          { name: 'reason', label: 'Motif', type: 'textarea' },
        ]}
        initial={{ days: 14 }}
        onSubmit={async (v) => {
          await subscriptionsApi.freeze(sub.id, { days: Number(v.days), reason: (v.reason as string) ?? undefined });
          toast.success(t('Abonnement gelé.'));
          refresh();
        }}
      />
    </div>
  );
}

function MembershipTab({ data }: { data: MemberDetail }) {
  const { t } = useI18n();
  const [renewing, setRenewing] = useState(false);
  const m = data.membership;
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="p-5">
        <p className="text-sm text-fg-2">{t('Statut de l’abonnement')}</p>
        <div className="mt-2 flex items-center gap-2">
          {m.active ? <Badge tone="good">{t('Actif')}</Badge> : <Badge tone="neutral">{t('Aucun abonnement en cours')}</Badge>}
        </div>
        {m.current && <p className="mt-4 text-xl font-semibold text-fg">{m.current.plan.name}</p>}
        {m.validUntil && (
          <p className="mt-1 text-sm text-fg-2">
            {t('Accès jusqu’au {date}', { date: formatDate(m.validUntil) })}
            {m.daysLeft !== null && `, ${t('jours restants : {n}', { n: formatInt(m.daysLeft) })}`}
          </p>
        )}
        {m.upcoming && <p className="mt-1 text-sm text-fg-2">{t('Renouvellement payé : {plan} dès le {date}', { plan: m.upcoming.plan.name, date: formatDate(m.upcoming.startDate) })}</p>}
        <Button className="mt-5 w-full" icon={<RefreshCw className="size-4" />} onClick={() => setRenewing(true)}>
          {t('Renouveler')}
        </Button>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader title={t('Historique des abonnements')} />
        <DataTable
          rows={data.subscriptions}
          rowKey={(s) => s.id}
          empty={<EmptyState title={t('Aucun abonnement')} description={t('Utilisez « Renouveler » pour souscrire une offre.')} />}
          columns={[
            { key: 'plan', header: 'Offre', cell: (s) => <span className="font-medium">{s.plan.name}</span> },
            { key: 'period', header: 'Période', cell: (s) => `${formatDate(s.startDate)} → ${formatDate(s.endDate)}` },
            { key: 'price', header: 'Prix', align: 'right', hideOnMobile: true, cell: (s) => formatTND(s.price) },
            { key: 'status', header: 'Statut', cell: (s) => <Badge tone={SUB_TONES[s.status]}>{t(SUBSCRIPTION_STATUS_LABELS[s.status])}</Badge> },
            { key: 'actions', header: <span className="sr-only">{t('Actions')}</span>, align: 'right', cell: (s) => <SubscriptionActions sub={s} memberId={data.member.id} /> },
          ]}
        />
      </Card>
      <RenewModal member={data} open={renewing} onClose={() => setRenewing(false)} />
    </div>
  );
}

function PaymentsTab({ data }: { data: MemberDetail }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  return (
    <Card>
      <CardHeader
        title={t('Paiements')}
        description={t('Total encaissé : {total}', { total: formatTND(data.payments.reduce((sum, p) => sum + p.amount, 0)) })}
        actions={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
            {t('Encaisser un paiement')}
          </Button>
        }
      />
      <DataTable
        rows={data.payments}
        rowKey={(p) => p.id}
        empty={<EmptyState title={t('Aucun paiement enregistré')} />}
        columns={[
          { key: 'date', header: 'Date', cell: (p) => formatDateTime(p.paidAt) },
          { key: 'plan', header: 'Objet', hideOnMobile: true, cell: (p) => p.planName ?? t('Paiement libre') },
          { key: 'method', header: 'Moyen', cell: (p) => t(PAYMENT_METHOD_LABELS[p.method]) },
          { key: 'ref', header: 'Référence', hideOnMobile: true, cell: (p) => p.reference ?? '—' },
          { key: 'by', header: 'Encaissé par', hideOnMobile: true, cell: (p) => p.receivedByName ?? '—' },
          { key: 'amount', header: 'Montant', align: 'right', cell: (p) => <span className="font-semibold">{formatTND(p.amount)}</span> },
        ]}
      />
      <FormModal
        open={adding}
        onClose={() => setAdding(false)}
        title={t('Encaisser un paiement')}
        submitLabel={t('Enregistrer le paiement')}
        size="md"
        fields={[
          { name: 'amount', label: 'Montant (DT)', type: 'number', required: true, min: 0, step: 0.001 },
          { name: 'method', label: 'Moyen de paiement', type: 'select', required: true, options: methodOptions },
          {
            name: 'subscriptionId',
            label: 'Abonnement concerné',
            type: 'select',
            options: data.subscriptions.map((s) => ({ value: s.id, label: `${s.plan.name} (${formatDate(s.startDate)})` })),
          },
          { name: 'reference', label: 'Référence' },
          { name: 'paidAt', label: 'Date du paiement', type: 'datetime', hint: 'Laisser vide pour maintenant' },
        ]}
        initial={{ method: 'CASH', amount: data.membership.current?.price ?? '' }}
        onSubmit={async (v) => {
          await membersApi.addPayment(data.member.id, {
            amount: Number(v.amount),
            method: v.method as PaymentMethod,
            reference: (v.reference as string) ?? undefined,
            subscriptionId: (v.subscriptionId as string) ?? undefined,
            paidAt: (v.paidAt as string) ?? undefined,
          });
          toast.success(t('Paiement enregistré.'));
          void queryClient.invalidateQueries({ queryKey: ['member', data.member.id] });
        }}
      />
    </Card>
  );
}

function AccessTab({ data }: { data: MemberDetail }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [rotating, setRotating] = useState(false);
  const revokeQr = async () => {
    const ok = await confirm({
      title: t('Révoquer le QR code de ce membre ?'),
      message: t('Les anciens QR codes cessent de fonctionner immédiatement. Le membre rouvre l’application pour obtenir un nouveau code.'),
      confirmLabel: t('Révoquer'),
      danger: true,
    });
    if (!ok) return;
    setRotating(true);
    try {
      const result = await membersApi.rotateAccessKey(data.member.id);
      toast.success(t('QR code révoqué le {date}.', { date: formatDateTime(result.rotatedAt) }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRotating(false);
    }
  };
  const [card, setCard] = useState(data.access.cardNumber ?? '');
  const save = useMutation({
    mutationFn: () => membersApi.setCard(data.member.id, card.trim() || null),
    onSuccess: () => {
      toast.success(card.trim() ? t('Badge enregistré : il sera envoyé au terminal de la porte.') : t('Badge retiré.'));
      void queryClient.invalidateQueries({ queryKey: ['member', data.member.id] });
    },
  });
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="p-5">
        <p className="flex items-center gap-2 font-semibold text-fg">
          <IdCard className="size-4" aria-hidden />
          {t('Badge RFID')}
        </p>
        <p className="mt-1 text-sm text-fg-2">{t('Numéro imprimé sur le badge ou lu par le terminal ZKTeco.')}</p>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Input label={t('Numéro de badge')} value={card} onChange={(e) => setCard(e.target.value)} placeholder="0012345678" />
          {save.isError && <ErrorNote message={errorMessage(save.error)} />}
          <Button type="submit" variant="secondary" loading={save.isPending}>
            {t('Enregistrer le badge')}
          </Button>
        </form>
        <div className="mt-6 border-t border-line pt-5">
          <p className="flex items-center gap-2 font-semibold text-fg">
            <QrCode className="size-4" aria-hidden />
            {t('QR code de l’application')}
          </p>
          <p className="mt-1 text-sm text-fg-2">{t('Téléphone perdu ou code partagé : révoquez-le, les anciens codes ne passent plus.')}</p>
          <Button className="mt-3 w-full" variant="danger" loading={rotating} onClick={() => void revokeQr()}>
            {t('Révoquer le QR (téléphone perdu)')}
          </Button>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted">{t('Visites ce mois')}</dt>
            <dd className="text-lg font-semibold text-fg">{formatInt(data.access.visitsThisMonth)}</dd>
          </div>
          <div>
            <dt className="text-muted">{t('Visites au total')}</dt>
            <dd className="text-lg font-semibold text-fg">{formatInt(data.access.totalVisits)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted">{t('Dernière visite')}</dt>
            <dd className="font-medium text-fg">{data.access.lastVisitAt ? formatDateTime(data.access.lastVisitAt) : t('Jamais venu')}</dd>
          </div>
        </dl>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader title={t('Dernières entrées')} />
        <DataTable
          rows={data.visits}
          rowKey={(v) => v.id}
          empty={<EmptyState title={t('Aucune entrée enregistrée')} />}
          columns={[
            { key: 'date', header: 'Date', cell: (v) => formatDateTime(v.createdAt) },
            { key: 'door', header: 'Porte', hideOnMobile: true, cell: (v) => v.doorName ?? '—' },
            { key: 'method', header: 'Moyen', cell: (v) => t(ACCESS_METHOD_LABELS[v.method]) },
            {
              key: 'result',
              header: 'Résultat',
              cell: (v) => (v.result === 'GRANTED' ? <Badge tone="good">{t('Autorisé')}</Badge> : <Badge tone="bad">{v.reason ?? t('Refusé')}</Badge>),
            },
          ]}
        />
      </Card>
    </div>
  );
}

function ProfileTab({ data }: { data: MemberDetail }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const m = data.member;
  const [form, setForm] = useState({
    firstName: m.firstName,
    lastName: m.lastName,
    phone: m.phone ?? '',
    birthDate: m.birthDate ?? '',
    gender: m.gender ?? '',
    emergencyContact: m.emergencyContact ?? '',
    notes: m.notes ?? '',
  });
  const save = useMutation({
    mutationFn: () =>
      membersApi.update(m.id, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || null,
        birthDate: form.birthDate || null,
        gender: (form.gender || null) as 'MALE' | 'FEMALE' | null,
        emergencyContact: form.emergencyContact.trim() || null,
        notes: form.notes.trim() || null,
      }),
    onSuccess: () => {
      toast.success(t('Profil enregistré.'));
      void queryClient.invalidateQueries({ queryKey: ['member', m.id] });
    },
  });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <Card className="p-5">
      <form
        className="grid max-w-3xl gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Input label={t('Prénom')} required value={form.firstName} onChange={set('firstName')} />
        <Input label={t('Nom')} required value={form.lastName} onChange={set('lastName')} />
        <Input label={t('E-mail')} value={m.email} disabled hint={t('Modifiable par le membre depuis l’application')} />
        <Input label={t('Téléphone')} type="tel" value={form.phone} onChange={set('phone')} />
        <Input label={t('Date de naissance')} type="date" value={form.birthDate} onChange={set('birthDate')} />
        <Select label={t('Genre')} value={form.gender} onChange={set('gender')}>
          <option value="">—</option>
          <option value="FEMALE">{t('Femme')}</option>
          <option value="MALE">{t('Homme')}</option>
        </Select>
        <Input label={t('Contact d’urgence')} value={form.emergencyContact} onChange={set('emergencyContact')} wrapperClassName="sm:col-span-2" />
        <Textarea label={t('Notes internes')} value={form.notes} onChange={set('notes')} wrapperClassName="sm:col-span-2" />
        {save.isError && (
          <div className="sm:col-span-2">
            <ErrorNote message={errorMessage(save.error)} />
          </div>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" loading={save.isPending}>
            {t('Enregistrer le profil')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ProgressTab({ memberId }: { memberId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const query = useQuery({ queryKey: ['measurements', memberId], queryFn: () => measurementsApi.list(memberId) });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button icon={<Ruler className="size-4" />} onClick={() => setAdding(true)}>
          {t('Nouvelle mesure')}
        </Button>
      </div>
      {query.isError && <ErrorNote message={errorMessage(query.error)} onRetry={() => query.refetch()} />}
      {query.data && <WeightChart data={query.data} />}
      <FormModal
        open={adding}
        onClose={() => setAdding(false)}
        title={t('Nouvelle mesure')}
        submitLabel={t('Enregistrer la mesure')}
        fields={[
          { name: 'date', label: 'Date', type: 'date' },
          { name: 'weightKg', label: 'Poids (kg)', type: 'number', step: 0.1 },
          { name: 'heightCm', label: 'Taille (cm)', type: 'number', step: 0.5 },
          { name: 'bodyFatPct', label: 'Masse grasse (%)', type: 'number', step: 0.1 },
          { name: 'musclePct', label: 'Masse musculaire (%)', type: 'number', step: 0.1 },
          { name: 'waistCm', label: 'Tour de taille (cm)', type: 'number', step: 0.5 },
          { name: 'chestCm', label: 'Tour de poitrine (cm)', type: 'number', step: 0.5 },
          { name: 'hipsCm', label: 'Tour de hanches (cm)', type: 'number', step: 0.5 },
          { name: 'armCm', label: 'Tour de bras (cm)', type: 'number', step: 0.5 },
          { name: 'thighCm', label: 'Tour de cuisse (cm)', type: 'number', step: 0.5 },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ]}
        initial={{ date: isoDay() }}
        onSubmit={async (v) => {
          await measurementsApi.create(memberId, v);
          toast.success(t('Mesure enregistrée.'));
          void queryClient.invalidateQueries({ queryKey: ['measurements', memberId] });
        }}
      />
    </div>
  );
}

export function MemberDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { t } = useI18n();
  const [tab, setTab] = useState<TabKey>('membership');
  const query = useQuery({ queryKey: ['member', id], queryFn: () => membersApi.get(id) });

  if (query.isLoading) return <PageSpinner />;
  if (query.isError || !query.data)
    return <ErrorNote message={query.error ? errorMessage(query.error) : t('Membre introuvable.')} onRetry={() => query.refetch()} />;

  const data = query.data;
  const m = data.member;
  const suspended = m.status === 'SUSPENDED';

  const toggleSuspend = async () => {
    const ok = await confirm({
      title: suspended ? t('Réactiver ce membre ?') : t('Suspendre ce membre ?'),
      message: suspended ? t('Il retrouvera l’accès aux portes selon son abonnement.') : t('Ses accès aux portes et à l’application sont bloqués jusqu’à réactivation.'),
      confirmLabel: suspended ? t('Réactiver') : t('Suspendre'),
      danger: !suspended,
    });
    if (!ok) return;
    try {
      await membersApi.update(m.id, { status: suspended ? 'ACTIVE' : 'SUSPENDED' });
      toast.success(suspended ? t('Membre réactivé.') : t('Membre suspendu.'));
      void queryClient.invalidateQueries({ queryKey: ['member', id] });
      void queryClient.invalidateQueries({ queryKey: ['members'] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: t('Supprimer définitivement ce membre ?'),
      message: t('Le compte, les abonnements et l’historique de paiements seront supprimés. Cette action est irréversible.'),
      confirmLabel: t('Supprimer'),
      danger: true,
    });
    if (!ok) return;
    try {
      await membersApi.remove(m.id);
      toast.success(t('Membre supprimé.'));
      void queryClient.invalidateQueries({ queryKey: ['members'] });
      navigate('/admin/membres');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/admin/membres" className="inline-flex items-center gap-1.5 text-sm text-fg-2 hover:text-fg">
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
          {t('Membres')}
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="type-wide text-2xl text-fg sm:text-[28px]">{fullName(m)}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-2">
              <span>{m.memberCode}</span>
              <span aria-hidden>/</span>
              <span>{t('Inscrit le {date}', { date: formatDate(m.joinedAt) })}</span>
              {suspended ? <Badge tone="bad">{t('Suspendu')}</Badge> : data.membership.active ? <Badge tone="good">{t('Actif')}</Badge> : <Badge>{t('Sans abonnement')}</Badge>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<CreditCard className="size-4" />} onClick={() => setTab('payments')}>
              {t('Paiements')}
            </Button>
            <Button variant={suspended ? 'secondary' : 'danger'} onClick={() => void toggleSuspend()}>
              {suspended ? t('Réactiver') : t('Suspendre')}
            </Button>
            {user?.role === 'ADMIN' && (
              <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => void remove()} aria-label={t('Supprimer le membre')}>
                {t('Supprimer')}
              </Button>
            )}
          </div>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { key: 'membership', label: 'Abonnement' },
          { key: 'payments', label: 'Paiements', count: data.payments.length },
          { key: 'access', label: 'Accès' },
          { key: 'profile', label: 'Profil' },
          { key: 'progress', label: 'Suivi physique' },
        ]}
      />

      {tab === 'membership' && <MembershipTab data={data} />}
      {tab === 'payments' && <PaymentsTab data={data} />}
      {tab === 'access' && <AccessTab key={data.access.cardNumber ?? 'none'} data={data} />}
      {tab === 'profile' && <ProfileTab key={m.id} data={data} />}
      {tab === 'progress' && <ProgressTab memberId={m.id} />}
    </div>
  );
}
