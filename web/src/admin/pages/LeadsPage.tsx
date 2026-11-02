import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, MessageSquarePlus, Phone, Plus, UserCheck } from 'lucide-react';
import clsx from 'clsx';
import { leadsApi } from '../../api/endpoints-ops';
import { plansApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import type { CreateMemberResult, PaymentMethod } from '../../api/types';
import type { LeadActivityType, LeadDto, LeadSource, LeadStatus } from '../../api/types-ops';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorNote, PageHeader } from '../../components/ui/Card';
import { Checkbox, Input, SearchInput, Select, Textarea } from '../../components/ui/Field';
import { enumOptions, FormModal, toLocalInput, type FieldDef } from '../../components/ui/FormModal';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';
import { formatDate, formatDateTime, formatTND, fullName, isoDay, PAYMENT_METHOD_LABELS, relativeTime } from '../../lib/format';
import { LEAD_ACTIVITY_LABELS, LEAD_SOURCE_LABELS, LEAD_STATUS } from '../../lib/labels-ops';
import { useI18n } from '../../i18n';

const PIPELINE: LeadStatus[] = ['NEW', 'CONTACTED', 'TRIAL', 'CONVERTED', 'LOST'];

function isDue(lead: LeadDto) {
  return Boolean(lead.followUpAt && lead.followUpAt.slice(0, 10) <= isoDay() && lead.status !== 'CONVERTED' && lead.status !== 'LOST');
}

function leadFields(plans: { value: string; label: string }[]): FieldDef[] {
  return [
    { name: 'firstName', label: 'Prénom', required: true },
    { name: 'lastName', label: 'Nom', required: true },
    { name: 'phone', label: 'Téléphone', type: 'tel' },
    { name: 'email', label: 'E-mail', type: 'email' },
    { name: 'source', label: 'Source', type: 'select', required: true, options: enumOptions(LEAD_SOURCE_LABELS) },
    { name: 'interestPlanId', label: 'Offre envisagée', type: 'select', options: plans },
    { name: 'trialDate', label: 'Séance d’essai', type: 'date' },
    { name: 'followUpAt', label: 'Relancer le', type: 'datetime' },
    { name: 'assignedToName', label: 'Suivi par' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
}

function ConvertModal({ lead, onClose, onDone }: { lead: LeadDto; onClose: () => void; onDone: (r: CreateMemberResult) => void }) {
  const { t } = useI18n();
  const plans = useQuery({ queryKey: ['plans', 'all'], queryFn: () => plansApi.list(false) });
  const [planId, setPlanId] = useState(lead.interestPlanId ?? '');
  const [pay, setPay] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [password, setPassword] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      leadsApi.convert(lead.id, {
        planId: planId || undefined,
        password: password || undefined,
        payment: planId && pay ? { method } : undefined,
      }),
    onSuccess: onDone,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={t('Inscrire {name}', { name: fullName(lead) })}
      description={t('Crée le compte membre et passe le prospect en « Inscrit ».')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Annuler')}
          </Button>
          <Button loading={mutation.isPending} onClick={() => mutation.mutate()} disabled={!lead.email}>
            {t('Inscrire le membre')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {!lead.email && <ErrorNote message={t('Ajoutez d’abord l’e-mail du prospect : il sert d’identifiant pour l’application.')} />}
        <Select label={t('Offre')} value={planId} onChange={(e) => setPlanId(e.target.value)}>
          <option value="">{t('Sans abonnement pour l’instant')}</option>
          {plans.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}, {formatTND(p.price)}
            </option>
          ))}
        </Select>
        {planId && <Checkbox label={t('Encaisser le paiement maintenant')} checked={pay} onChange={setPay} />}
        {planId && pay && (
          <Select label={t('Moyen de paiement')} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((value) => (
              <option key={value} value={value}>
                {t(PAYMENT_METHOD_LABELS[value])}
              </option>
            ))}
          </Select>
        )}
        <Input label={t('Mot de passe de l’application')} value={password} onChange={(e) => setPassword(e.target.value)} hint={t('Vide : un mot de passe provisoire est généré.')} />
        {mutation.isError && <ErrorNote message={errorMessage(mutation.error)} />}
      </div>
    </Modal>
  );
}

function LeadDrawer({ leadId, onClose, onEdit }: { leadId: string; onClose: () => void; onEdit: (lead: LeadDto) => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const lead = useQuery({ queryKey: ['lead', leadId], queryFn: () => leadsApi.get(leadId) });
  const [type, setType] = useState<LeadActivityType>('CALL');
  const [note, setNote] = useState('');
  const [converting, setConverting] = useState(false);
  const [converted, setConverted] = useState<CreateMemberResult | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
    void queryClient.invalidateQueries({ queryKey: ['leads'] });
  };
  const addActivity = useMutation({
    mutationFn: () => leadsApi.addActivity(leadId, type, note.trim() || undefined),
    onSuccess: () => {
      setNote('');
      refresh();
    },
  });
  const setStatus = async (status: LeadStatus) => {
    try {
      await leadsApi.update(leadId, { status });
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const l = lead.data;
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={l ? fullName(l) : t('Prospect')}
      description={l ? t('{source}, arrivé {when}', { source: t(LEAD_SOURCE_LABELS[l.source]), when: relativeTime(l.createdAt) }) : undefined}
      footer={
        l && (
          <>
            <Button variant="secondary" onClick={() => onEdit(l)}>
              {t('Modifier')}
            </Button>
            {l.status !== 'CONVERTED' && (
              <Button icon={<UserCheck className="size-4" />} onClick={() => setConverting(true)}>
                {t('Inscrire comme membre')}
              </Button>
            )}
            {l.convertedMemberId && <Button onClick={() => navigate(`/admin/membres/${l.convertedMemberId}`)}>{t('Voir la fiche membre')}</Button>}
          </>
        )
      }
    >
      {lead.isLoading && <Skeleton className="h-48" />}
      {lead.isError && <ErrorNote message={errorMessage(lead.error)} />}
      {l && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('Étape')}>
            {PIPELINE.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void setStatus(s)}
                aria-pressed={l.status === s}
                className={clsx(
                  'rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors',
                  l.status === s ? 'bg-fg text-page ring-fg' : 'text-fg-2 ring-line hover:text-fg',
                )}
              >
                {t(LEAD_STATUS[s].label)}
              </button>
            ))}
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">{t('Téléphone')}</dt>
              <dd className="font-medium text-fg">{l.phone ? <a href={`tel:${l.phone}`} className="inline-flex items-center gap-1.5 hover:underline"><Phone className="size-3.5" aria-hidden />{l.phone}</a> : '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">{t('E-mail')}</dt>
              <dd className="font-medium text-fg">{l.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">{t('Offre envisagée')}</dt>
              <dd className="font-medium text-fg">{l.interestPlanName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">{t('Séance d’essai')}</dt>
              <dd className="font-medium text-fg">{l.trialDate ? formatDate(l.trialDate) : '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">{t('Relancer le')}</dt>
              <dd className={clsx('font-medium', isDue(l) ? 'text-bad' : 'text-fg')}>{l.followUpAt ? formatDateTime(l.followUpAt) : '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">{t('Suivi par')}</dt>
              <dd className="font-medium text-fg">{l.assignedToName ?? '—'}</dd>
            </div>
            {l.notes && (
              <div className="sm:col-span-2">
                <dt className="text-muted">{t('Notes')}</dt>
                <dd className="whitespace-pre-line text-fg">{l.notes}</dd>
              </div>
            )}
          </dl>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-fg">{t('Historique des échanges')}</h3>
            <form
              className="mb-4 flex flex-col gap-2 rounded-lg bg-page p-3 ring-1 ring-line"
              onSubmit={(e) => {
                e.preventDefault();
                addActivity.mutate();
              }}
            >
              <div className="flex flex-wrap gap-2">
                {(Object.keys(LEAD_ACTIVITY_LABELS) as LeadActivityType[]).map((type2) => (
                  <button
                    key={type2}
                    type="button"
                    aria-pressed={type === type2}
                    onClick={() => setType(type2)}
                    className={clsx('rounded-md px-2.5 py-1 text-xs font-medium ring-1', type === type2 ? 'bg-card-2 text-fg ring-fg-2/40' : 'text-fg-2 ring-line')}
                  >
                    {t(LEAD_ACTIVITY_LABELS[type2])}
                  </button>
                ))}
              </div>
              <Textarea aria-label={t('Compte rendu')} rows={2} placeholder={t('Ce qui a été dit, la prochaine étape…')} value={note} onChange={(e) => setNote(e.target.value)} />
              <Button type="submit" size="sm" variant="secondary" icon={<MessageSquarePlus className="size-4" />} loading={addActivity.isPending} className="self-end">
                {t('Ajouter à l’historique')}
              </Button>
            </form>
            {(l.activities ?? []).length === 0 ? (
              <p className="text-sm text-muted">{t('Aucun échange enregistré.')}</p>
            ) : (
              <ol className="relative flex flex-col gap-4 border-s border-line ps-5">
                {l.activities!.map((a) => (
                  <li key={a.id}>
                    <span className="absolute -start-[5px] mt-1.5 size-2.5 rounded-full bg-fg-2" aria-hidden />
                    <p className="text-sm font-medium text-fg">
                      {t(LEAD_ACTIVITY_LABELS[a.type])}
                      <span className="ms-2 text-xs font-normal text-muted">
                        {formatDateTime(a.at)}
                        {a.byName ? `, ${a.byName}` : ''}
                      </span>
                    </p>
                    {a.note && <p className="mt-0.5 text-sm whitespace-pre-line text-fg-2">{a.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
      {converting && l && (
        <ConvertModal
          lead={l}
          onClose={() => setConverting(false)}
          onDone={(r) => {
            setConverting(false);
            setConverted(r);
            toast.success(t('{name} est maintenant membre.', { name: fullName(r.member) }));
            refresh();
            void queryClient.invalidateQueries({ queryKey: ['members'] });
          }}
        />
      )}
      <Modal open={Boolean(converted?.temporaryPassword)} onClose={() => setConverted(null)} title={t('Mot de passe provisoire')} size="sm">
        <p className="text-2xl font-semibold tracking-wide text-fg select-all">{converted?.temporaryPassword}</p>
        <p className="mt-2 text-sm text-fg-2">{t('Affiché une seule fois. Donnez-le au nouveau membre pour sa première connexion.')}</p>
      </Modal>
    </Modal>
  );
}

export function LeadsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<LeadSource | ''>('');
  const [dueOnly, setDueOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<LeadDto | 'new' | null>(null);
  const leads = useQuery({ queryKey: ['leads', search, source, dueOnly], queryFn: () => leadsApi.list({ search: search || undefined, source, dueOnly }) });
  const plans = useQuery({ queryKey: ['plans', 'all'], queryFn: () => plansApi.list(false) });
  const planOptions = (plans.data ?? []).map((p) => ({ value: p.id, label: p.name }));
  const all = leads.data ?? [];
  const dueCount = all.filter(isDue).length;

  return (
    <div>
      <PageHeader
        title={t('Prospects')}
        description={t('Demandes d’essai du site, passages à l’accueil et contacts Instagram, jusqu’à l’inscription.')}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            {t('Nouveau prospect')}
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder={t('Nom, téléphone, e-mail')} className="w-full sm:w-80" />
        <Select value={source} onChange={(e) => setSource(e.target.value as LeadSource | '')} aria-label={t('Source')} className="w-48">
          <option value="">{t('Toutes les sources')}</option>
          {(Object.keys(LEAD_SOURCE_LABELS) as LeadSource[]).map((value) => (
            <option key={value} value={value}>
              {t(LEAD_SOURCE_LABELS[value])}
            </option>
          ))}
        </Select>
        <Button variant={dueOnly ? 'primary' : 'secondary'} icon={<BellRing className="size-4" />} onClick={() => setDueOnly((v) => !v)} aria-pressed={dueOnly}>
          {t('Relances dues')}
          {dueCount > 0 && !dueOnly ? ` (${dueCount})` : ''}
        </Button>
      </div>
      {leads.isError && <ErrorNote message={errorMessage(leads.error)} onRetry={() => leads.refetch()} />}
      <div className="scroll-thin overflow-x-auto pb-2">
        <div className="grid min-w-[1050px] grid-cols-5 gap-3">
          {PIPELINE.map((status) => {
            const column = all.filter((l) => l.status === status);
            return (
              <section key={status} aria-label={t(LEAD_STATUS[status].label)} className="flex min-h-[360px] flex-col rounded-xl bg-card ring-1 ring-line">
                <header className="flex items-center justify-between border-b border-line px-3 py-2.5">
                  <h2 className="text-sm font-semibold text-fg">{t(LEAD_STATUS[status].label)}</h2>
                  <span className="rounded-full bg-card-2 px-2 text-xs text-fg-2 tabular">{column.length}</span>
                </header>
                <ul className="flex flex-1 flex-col gap-2 p-2">
                  {leads.isLoading && <Skeleton className="h-20" />}
                  {column.map((lead) => (
                    <li key={lead.id}>
                      <button type="button" onClick={() => setOpenId(lead.id)} className="w-full rounded-lg bg-page p-3 text-start ring-1 ring-line transition-shadow hover:ring-fg-2/40">
                        <p className="text-sm font-semibold text-fg">{fullName(lead)}</p>
                        <p className="text-xs text-muted">{t(LEAD_SOURCE_LABELS[lead.source])}{lead.interestPlanName ? `, ${lead.interestPlanName}` : ''}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {isDue(lead) && <Badge tone="bad">{t('Relance due')}</Badge>}
                          {lead.trialDate && status === 'TRIAL' && <Badge tone="warn">{t('Essai le {date}', { date: formatDate(lead.trialDate, { day: 'numeric', month: 'short' }) })}</Badge>}
                        </div>
                      </button>
                    </li>
                  ))}
                  {!leads.isLoading && column.length === 0 && <li className="px-1 py-2 text-xs text-muted">{t('Aucun prospect')}</li>}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
      {!leads.isLoading && all.length === 0 && !leads.isError && (
        <EmptyState title={t('Aucun prospect')} description={t('Les demandes d’essai envoyées depuis le site arrivent ici automatiquement.')} />
      )}

      {openId && (
        <LeadDrawer
          leadId={openId}
          onClose={() => setOpenId(null)}
          onEdit={(lead) => {
            setOpenId(null);
            setEditing(lead);
          }}
        />
      )}
      <FormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('Nouveau prospect') : t('Modifier le prospect')}
        submitLabel={editing === 'new' ? t('Ajouter le prospect') : t('Enregistrer')}
        fields={leadFields(planOptions)}
        initial={
          editing === 'new' || !editing
            ? { source: 'WALK_IN', followUpAt: toLocalInput(new Date(Date.now() + 86_400_000).toISOString()) }
            : { ...editing }
        }
        onSubmit={async (v) => {
          if (editing === 'new') await leadsApi.create(v);
          else if (editing) await leadsApi.update(editing.id, v);
          toast.success(t('Prospect enregistré.'));
          void queryClient.invalidateQueries({ queryKey: ['leads'] });
        }}
      />
    </div>
  );
}
