import { useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, DoorOpen, KeyRound, Pencil, Plus, Server, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { accessApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../api/auth';
import { useLiveAccess } from '../../api/live';
import { SECRET_MASK, type AccessLogDto, type AccessResult, type CreateDoorRequest, type DoorDriver, type DoorDto } from '../../api/types';
import { Badge, StatusDot } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, CardHeader, EmptyState, ErrorNote, PageHeader } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { Select } from '../../components/ui/Field';
import { FormModal, type FieldDef, type SubmitValues } from '../../components/ui/FormModal';
import { Modal, useConfirm } from '../../components/ui/Modal';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import { ACCESS_METHOD_LABELS, DOOR_DRIVER_LABELS, formatDateTime, relativeTime } from '../../lib/format';
import { useI18n } from '../../i18n';

type TabKey = 'doors' | 'log' | 'agents';

/** Hint for a secret the API returned masked: an empty input keeps the stored value. */
function secretHint(v: SubmitValues, key: string) {
  return v[key] === SECRET_MASK ? ('Laisser vide pour conserver la valeur actuelle.' as const) : undefined;
}

function doorFields(agents: { value: string; label: string }[], existing: SubmitValues | null): FieldDef[] {
  const masked = existing ?? {};
  return [
    { name: 'name', label: 'Nom de la porte', required: true },
    { name: 'location', label: 'Emplacement' },
    {
      name: 'driver',
      label: 'Matériel',
      type: 'select',
      required: true,
      options: (Object.keys(DOOR_DRIVER_LABELS) as DoorDriver[]).map((d) => ({ value: d, label: DOOR_DRIVER_LABELS[d] })),
    },
    { name: 'agentId', label: 'Agent de porte (PC de la salle)', type: 'select', options: agents, hint: 'Obligatoire pour un terminal ZKTeco sur le réseau local.' },
    { name: 'unlockSeconds', label: 'Durée d’ouverture (secondes)', type: 'number', min: 1, max: 30, step: 1 },
    { name: 'zkIp', label: 'Adresse IP du terminal', placeholder: '192.168.1.201', hidden: (v) => v.driver !== 'ZKTECO' },
    { name: 'zkPort', label: 'Port', type: 'number', placeholder: '4370', hidden: (v) => v.driver !== 'ZKTECO' },
    { name: 'zkCommKey', label: 'Clé de communication (CommKey)', type: 'password', hint: secretHint(masked, 'zkCommKeyMasked'), hidden: (v) => v.driver !== 'ZKTECO' },
    { name: 'relayUrl', label: 'URL du relais', placeholder: 'http://192.168.1.50/rpc/Switch.Set?id=0&on=true', wide: true, hidden: (v) => v.driver !== 'HTTP_RELAY' },
    {
      name: 'relayMethod',
      label: 'Méthode HTTP',
      type: 'select',
      options: [
        { value: 'GET', label: 'GET' },
        { value: 'POST', label: 'POST' },
      ],
      hidden: (v) => v.driver !== 'HTTP_RELAY',
    },
    { name: 'relayUser', label: 'Utilisateur (authentification basique)', hidden: (v) => v.driver !== 'HTTP_RELAY' },
    { name: 'relayPassword', label: 'Mot de passe (authentification basique)', type: 'password', hint: secretHint(masked, 'relayPasswordMasked'), hidden: (v) => v.driver !== 'HTTP_RELAY' },
    { name: 'relayHeaderName', label: 'En-tête HTTP (nom)', placeholder: 'Authorization', hidden: (v) => v.driver !== 'HTTP_RELAY' },
    { name: 'relayHeaderValue', label: 'En-tête HTTP (valeur)', type: 'password', hint: secretHint(masked, 'relayHeaderMasked'), hidden: (v) => v.driver !== 'HTTP_RELAY' },
    { name: 'isActive', label: 'Porte active', type: 'checkbox' },
    {
      name: 'allowAppOpen',
      label: 'Ouverture depuis l’application',
      type: 'checkbox',
      hint: 'Les membres peuvent ouvrir cette porte depuis l’application, sur place.',
    },
  ];
}

/** A secret input left empty keeps the stored value (the API accepts the mask back). */
function secret(value: unknown, wasMasked: boolean): string | undefined {
  if (typeof value === 'string' && value !== '') return value;
  return wasMasked ? SECRET_MASK : undefined;
}

function toDoorBody(v: SubmitValues, existing: DoorDto | null): CreateDoorRequest {
  const driver = v.driver as DoorDriver;
  // Start from the stored config so fields this form does not edit (and masked secrets) are kept.
  const base: Record<string, unknown> = existing && existing.driver === driver ? { ...existing.config } : {};
  const old = existing ? fromDoor(existing) : {};
  let config: Record<string, unknown> = {};
  if (driver === 'ZKTECO') {
    config = { ...base, ip: v.zkIp, port: v.zkPort ?? 4370 };
    const commKey = secret(v.zkCommKey, old.zkCommKeyMasked === SECRET_MASK);
    if (commKey !== undefined) config.commKey = commKey;
    else delete config.commKey;
  } else if (driver === 'HTTP_RELAY') {
    config = { ...base, url: v.relayUrl, method: v.relayMethod ?? 'GET' };
    const user = typeof v.relayUser === 'string' ? v.relayUser : '';
    const password = secret(v.relayPassword, old.relayPasswordMasked === SECRET_MASK);
    if (user || password) config.basicAuth = { username: user, ...(password !== undefined ? { password } : {}) };
    else delete config.basicAuth;
    const headerName = typeof v.relayHeaderName === 'string' ? v.relayHeaderName.trim() : '';
    if (headerName) {
      const value = secret(v.relayHeaderValue, old.relayHeaderMasked === SECRET_MASK && old.relayHeaderName === headerName);
      config.headers = { ...((base.headers as Record<string, unknown>) ?? {}), ...(value !== undefined ? { [headerName]: value } : {}) };
    }
  }
  return {
    name: String(v.name),
    location: (v.location as string) ?? null,
    driver,
    agentId: (v.agentId as string) ?? null,
    unlockSeconds: (v.unlockSeconds as number) ?? 5,
    isActive: Boolean(v.isActive),
    allowAppOpen: Boolean(v.allowAppOpen),
    config,
  };
}

function fromDoor(door: DoorDto): SubmitValues {
  const c = door.config ?? {};
  const basicAuth = (c.basicAuth as { username?: string; password?: string } | undefined) ?? {};
  const headers = (c.headers as Record<string, string> | undefined) ?? {};
  const headerName = Object.keys(headers)[0] ?? '';
  return {
    ...door,
    zkIp: c.ip,
    zkPort: c.port,
    zkCommKey: '',
    zkCommKeyMasked: c.commKey ?? c.password,
    relayUrl: c.url,
    relayMethod: c.method,
    relayUser: basicAuth.username ?? '',
    relayPassword: '',
    relayPasswordMasked: basicAuth.password,
    relayHeaderName: headerName,
    relayHeaderValue: '',
    relayHeaderMasked: headerName ? headers[headerName] : undefined,
  };
}

function DoorsTab({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<DoorDto | 'new' | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const doors = useQuery({ queryKey: ['doors'], queryFn: accessApi.doors, refetchInterval: 15_000 });
  const agents = useQuery({ queryKey: ['agents'], queryFn: accessApi.agents, enabled: isAdmin });
  const agentOptions = (agents.data ?? []).map((a) => ({ value: a.id, label: a.name }));

  const open = async (door: DoorDto) => {
    setOpening(door.id);
    try {
      const decision = await accessApi.openDoor(door.id, 'Ouverture depuis le back-office');
      if (decision.granted) toast.success(t('{name} ouverte.', { name: door.name }));
      else toast.error(decision.reason ?? t('La porte n’a pas répondu.'));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {isAdmin && (
        <div className="flex justify-end">
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            {t('Nouvelle porte')}
          </Button>
        </div>
      )}
      {doors.isError && <ErrorNote message={errorMessage(doors.error)} onRetry={() => doors.refetch()} />}
      {doors.data?.length === 0 && (
        <Card>
          <EmptyState icon={<DoorOpen className="size-8" />} title={t('Aucune porte configurée')} description={t('Ajoutez la porte d’entrée, puis reliez-la à l’agent installé sur le PC de la salle.')} />
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {doors.data?.map((door) => (
          <Card key={door.id} className="flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-fg">{door.name}</p>
                <p className="text-sm text-fg-2">{door.location ?? t(DOOR_DRIVER_LABELS[door.driver])}</p>
              </div>
              {isAdmin && (
                <div className="flex gap-1">
                  <IconButton label={t('Modifier {name}', { name: door.name })} onClick={() => setEditing(door)}>
                    <Pencil className="size-4" />
                  </IconButton>
                  <IconButton
                    label={t('Supprimer {name}', { name: door.name })}
                    onClick={async () => {
                      if (!(await confirm({ title: t('Supprimer la porte {name} ?', { name: door.name }), confirmLabel: t('Supprimer'), danger: true }))) return;
                      try {
                        await accessApi.removeDoor(door.id);
                        void queryClient.invalidateQueries({ queryKey: ['doors'] });
                      } catch (err) {
                        toast.error(errorMessage(err));
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <StatusDot tone={door.online ? 'good' : 'bad'} label={door.online ? t('En ligne') : t('Hors ligne')} />
              <span className="text-sm text-fg-2">{t(DOOR_DRIVER_LABELS[door.driver])}</span>
              {door.agentName && <span className="text-sm text-fg-2">{t('via {agent}', { agent: door.agentName })}</span>}
              {!door.isActive && <Badge>{t('Désactivée')}</Badge>}
              {door.allowAppOpen === false && <Badge tone="warn">{t('Pas d’ouverture par l’application')}</Badge>}
            </div>
            <Button className="mt-auto" icon={<DoorOpen className="size-4" />} loading={opening === door.id} disabled={!door.isActive} onClick={() => void open(door)}>
              {t('Ouvrir {n} s', { n: door.unlockSeconds })}
            </Button>
          </Card>
        ))}
      </div>
      <FormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('Nouvelle porte') : t('Modifier la porte')}
        submitLabel={editing === 'new' ? t('Créer la porte') : t('Enregistrer')}
        fields={doorFields(agentOptions, editing && editing !== 'new' ? fromDoor(editing) : null)}
        initial={editing === 'new' || !editing ? { driver: 'SIMULATOR', unlockSeconds: 5, isActive: true, allowAppOpen: true, relayMethod: 'GET' } : fromDoor(editing)}
        onSubmit={async (v) => {
          const body = toDoorBody(v, editing === 'new' ? null : editing);
          if (editing === 'new') await accessApi.createDoor(body);
          else if (editing) await accessApi.updateDoor(editing.id, body);
          toast.success(t('Porte enregistrée.'));
          void queryClient.invalidateQueries({ queryKey: ['doors'] });
        }}
      />
    </div>
  );
}

function LogTab() {
  const { t } = useI18n();
  const [doorId, setDoorId] = useState('');
  const [result, setResult] = useState<AccessResult | ''>('');
  const doors = useQuery({ queryKey: ['doors'], queryFn: accessApi.doors });
  const queryClient = useQueryClient();
  const live = useLiveAccess(() => void queryClient.invalidateQueries({ queryKey: ['doors'] }), 50);
  const pages = useInfiniteQuery({
    queryKey: ['access-log', doorId, result],
    queryFn: ({ pageParam }) => accessApi.logs({ limit: 50, doorId: doorId || undefined, result, before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length === 50 ? last[last.length - 1].createdAt : undefined),
  });
  const fetched = pages.data?.pages.flat() ?? [];
  const fresh = live.events.filter((e) => (!doorId || e.doorId === doorId) && (!result || e.result === result) && !fetched.some((f) => f.id === e.id));
  const rows: AccessLogDto[] = [...fresh, ...fetched];

  return (
    <Card>
      <CardHeader
        title={t('Journal des accès')}
        description={live.status === 'live' ? t('Mise à jour en direct') : t('Connexion au direct…')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Select value={doorId} onChange={(e) => setDoorId(e.target.value)} aria-label={t('Filtrer par porte')} className="w-48">
              <option value="">{t('Toutes les portes')}</option>
              {doors.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <Select value={result} onChange={(e) => setResult(e.target.value as AccessResult | '')} aria-label={t('Filtrer par résultat')} className="w-40">
              <option value="">{t('Tous')}</option>
              <option value="GRANTED">{t('Autorisés')}</option>
              <option value="DENIED">{t('Refusés')}</option>
            </Select>
          </div>
        }
      />
      {pages.isError && <ErrorNote message={errorMessage(pages.error)} onRetry={() => pages.refetch()} />}
      <DataTable
        rows={rows}
        rowKey={(l) => l.id}
        loading={pages.isLoading}
        empty={<EmptyState title={t('Aucun passage enregistré')} />}
        columns={[
          { key: 'when', header: 'Quand', cell: (l) => <span title={formatDateTime(l.createdAt)}>{relativeTime(l.createdAt)}</span> },
          { key: 'who', header: 'Qui', cell: (l) => l.memberName ?? (l.openedByName ? t('{name} (équipe)', { name: l.openedByName }) : '—') },
          { key: 'door', header: 'Porte', hideOnMobile: true, cell: (l) => l.doorName ?? '—' },
          { key: 'method', header: 'Moyen', hideOnMobile: true, cell: (l) => t(ACCESS_METHOD_LABELS[l.method]) },
          { key: 'result', header: 'Résultat', cell: (l) => (l.result === 'GRANTED' ? <Badge tone="good">{t('Autorisé')}</Badge> : <Badge tone="bad">{l.reason ?? t('Refusé')}</Badge>) },
        ]}
      />
      {pages.hasNextPage && (
        <div className="border-t border-line p-3 text-center">
          <Button variant="ghost" loading={pages.isFetchingNextPage} onClick={() => void pages.fetchNextPage()}>
            {t('Afficher plus')}
          </Button>
        </div>
      )}
    </Card>
  );
}

function AgentsTab() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [key, setKey] = useState<{ name: string; apiKey: string } | null>(null);
  const agents = useQuery({ queryKey: ['agents'], queryFn: accessApi.agents, refetchInterval: 15_000 });

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5 text-sm text-fg-2">
        <p className="flex items-center gap-2 font-semibold text-fg">
          <Server className="size-4" aria-hidden />
          {t('Comment ça marche')}
        </p>
        <p className="mt-2 max-w-3xl">
          {t('L’agent de porte tourne sur un PC ou un Raspberry Pi de la salle, sur le même réseau que le terminal ZKTeco ou le relais. Il se connecte au serveur avec sa clé et ouvre la porte quand un accès est autorisé (QR code, application, badge ou ouverture manuelle).')}
        </p>
      </Card>
      <div className="flex justify-end">
        <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
          {t('Nouvel agent')}
        </Button>
      </div>
      <Card>
        <DataTable
          rows={agents.data}
          rowKey={(a) => a.id}
          loading={agents.isLoading}
          empty={<EmptyState title={t('Aucun agent')} description={t('Créez un agent puis collez sa clé dans le fichier .env du door-agent.')} />}
          columns={[
            { key: 'name', header: 'Agent', cell: (a) => <span className="font-medium">{a.name}</span> },
            { key: 'status', header: 'État', cell: (a) => <StatusDot tone={a.online ? 'good' : 'bad'} label={a.online ? t('Connecté') : t('Déconnecté')} /> },
            { key: 'seen', header: 'Dernier signal', hideOnMobile: true, cell: (a) => (a.lastSeenAt ? relativeTime(a.lastSeenAt) : t('Jamais')) },
            { key: 'doors', header: 'Portes', align: 'right', cell: (a) => a.doorCount },
            {
              key: 'actions',
              header: <span className="sr-only">{t('Actions')}</span>,
              align: 'right',
              cell: (a) => (
                <IconButton
                  label={t('Supprimer {name}', { name: a.name })}
                  onClick={async () => {
                    if (!(await confirm({ title: t('Supprimer l’agent {name} ?', { name: a.name }), message: t('Sa clé ne fonctionnera plus et ses portes ne s’ouvriront plus automatiquement.'), confirmLabel: t('Supprimer'), danger: true }))) return;
                    try {
                      await accessApi.removeAgent(a.id);
                      void queryClient.invalidateQueries({ queryKey: ['agents'] });
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              ),
            },
          ]}
        />
      </Card>
      <FormModal
        open={creating}
        onClose={() => setCreating(false)}
        title={t('Nouvel agent de porte')}
        size="sm"
        submitLabel={t('Créer l’agent')}
        fields={[{ name: 'name', label: 'Nom', required: true }]}
        onSubmit={async (v) => {
          const result = await accessApi.createAgent(String(v.name));
          setKey({ name: result.agent.name, apiKey: result.apiKey });
          void queryClient.invalidateQueries({ queryKey: ['agents'] });
        }}
      />
      <Modal
        open={Boolean(key)}
        onClose={() => setKey(null)}
        title={t('Clé de l’agent')}
        size="md"
        footer={<Button onClick={() => setKey(null)}>{t('J’ai copié la clé')}</Button>}
      >
        {key && (
          <div className="flex flex-col gap-4 text-sm text-fg-2">
            <p className="flex items-center gap-2">
              <KeyRound className="size-4" aria-hidden />
              {t('Clé de {name}, affichée une seule fois.', { name: key.name })}
            </p>
            <div className="flex items-center gap-2 rounded-lg bg-page p-3 ring-1 ring-line">
              <code className="min-w-0 flex-1 text-sm break-all text-fg select-all">{key.apiKey}</code>
              <IconButton
                label={t('Copier la clé')}
                onClick={() => {
                  void navigator.clipboard?.writeText(key.apiKey);
                  toast.success(t('Clé copiée.'));
                }}
              >
                <Copy className="size-4" />
              </IconButton>
            </div>
            <p>
              {t('Dans door-agent/.env sur le PC de la salle : AGENT_KEY=…, puis redémarrez l’agent.')}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function AccessPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const isAdmin = user?.role === 'ADMIN';
  const [tab, setTab] = useState<TabKey>('doors');
  return (
    <div>
      <PageHeader title={t('Portes et accès')} description={t('Ouverture des portes, journal des passages et agents installés à la salle.')} />
      <Tabs
        className={clsx('mb-5 w-fit')}
        value={tab}
        onChange={setTab}
        items={[
          { key: 'doors', label: 'Portes' },
          { key: 'log', label: 'Journal' },
          ...(isAdmin ? [{ key: 'agents' as const, label: 'Agents' as const }] : []),
        ]}
      />
      {tab === 'doors' && <DoorsTab isAdmin={isAdmin} />}
      {tab === 'log' && <LogTab />}
      {tab === 'agents' && isAdmin && <AgentsTab />}
    </div>
  );
}
