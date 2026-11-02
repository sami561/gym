import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Lock, Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import clsx from 'clsx';
import { equipmentApi, lockersApi, maintenanceApi, roomsApi } from '../../../api/endpoints-ops';
import { membersApi } from '../../../api/endpoints';
import { errorMessage } from '../../../api/client';
import type { RoomDto } from '../../../api/types';
import type { EquipmentDto, LockerDto, MaintenanceTicketDto, TicketStatus } from '../../../api/types-ops';
import { Badge } from '../../../components/ui/Badge';
import { Button, IconButton } from '../../../components/ui/Button';
import { Card, CardHeader, EmptyState, ErrorNote, PageHeader } from '../../../components/ui/Card';
import { DataTable } from '../../../components/ui/DataTable';
import { Input, Select } from '../../../components/ui/Field';
import { enumOptions, FormModal, type FieldDef } from '../../../components/ui/FormModal';
import { Modal, useConfirm } from '../../../components/ui/Modal';
import { Tabs } from '../../../components/ui/Tabs';
import { useToast } from '../../../components/ui/Toast';
import { formatDate, formatDateTime, formatTND, fullName, isoDay } from '../../../lib/format';
import {
  EQUIPMENT_CATEGORY_LABELS,
  EQUIPMENT_STATUS,
  LOCKER_STATUS_LABELS,
  ROOM_TYPE_LABELS,
  TICKET_PRIORITY,
  TICKET_STATUS,
} from '../../../lib/labels-ops';
import { useI18n, type TFunction } from '../../../i18n';

type TabKey = 'rooms' | 'equipment' | 'tickets' | 'lockers';

function useRooms() {
  return useQuery({ queryKey: ['rooms'], queryFn: roomsApi.list });
}

function RoomsTab() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<RoomDto | 'new' | null>(null);
  const rooms = useRooms();
  const fields: FieldDef[] = [
    { name: 'name', label: 'Nom', required: true, placeholder: 'Plateau musculation' },
    { name: 'type', label: 'Type', type: 'select', required: true, options: enumOptions(ROOM_TYPE_LABELS) },
    { name: 'capacity', label: 'Capacité (personnes)', type: 'number', required: true, min: 1, step: 1 },
    { name: 'floor', label: 'Étage' },
    { name: 'description', label: 'Description (affichée sur le site)', type: 'textarea' },
    { name: 'isActive', label: 'Ouverte', type: 'checkbox' },
  ];
  return (
    <Card>
      <CardHeader
        title={t('Salles')}
        description={t('Les salles ouvertes sont présentées sur le site.')}
        actions={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            {t('Nouvelle salle')}
          </Button>
        }
      />
      {rooms.isError && <ErrorNote message={errorMessage(rooms.error)} onRetry={() => rooms.refetch()} />}
      <DataTable
        rows={rooms.data}
        rowKey={(r) => r.id}
        loading={rooms.isLoading}
        empty={<EmptyState title={t('Aucune salle')} />}
        columns={[
          { key: 'name', header: 'Salle', cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted">{t(ROOM_TYPE_LABELS[r.type])}{r.floor ? `, ${r.floor}` : ''}</p></div> },
          { key: 'cap', header: 'Capacité', align: 'right', cell: (r) => r.capacity },
          { key: 'eq', header: 'Équipements', align: 'right', hideOnMobile: true, cell: (r) => r.equipmentCount },
          { key: 'active', header: 'Statut', cell: (r) => (r.isActive ? <Badge tone="good">{t('Ouverte')}</Badge> : <Badge>{t('Fermée')}</Badge>) },
          {
            key: 'actions',
            header: <span className="sr-only">{t('Actions')}</span>,
            align: 'right',
            cell: (r) => (
              <div className="flex justify-end gap-1">
                <IconButton label={t('Modifier {name}', { name: r.name })} onClick={() => setEditing(r)}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton
                  label={t('Supprimer {name}', { name: r.name })}
                  onClick={async () => {
                    if (!(await confirm({ title: t('Supprimer {name} ?', { name: r.name }), confirmLabel: t('Supprimer'), danger: true }))) return;
                    try {
                      await roomsApi.remove(r.id);
                      void queryClient.invalidateQueries({ queryKey: ['rooms'] });
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
        title={editing === 'new' ? t('Nouvelle salle') : t('Modifier la salle')}
        submitLabel={t('Enregistrer')}
        fields={fields}
        initial={editing === 'new' || !editing ? { type: 'MUSCULATION', isActive: true } : { ...editing }}
        onSubmit={async (v) => {
          if (editing === 'new') await roomsApi.create(v);
          else if (editing) await roomsApi.update(editing.id, v);
          toast.success(t('Salle enregistrée.'));
          void queryClient.invalidateQueries({ queryKey: ['rooms'] });
        }}
      />
    </Card>
  );
}

function maintenanceBadge(e: EquipmentDto, t: TFunction) {
  if (!e.nextMaintenanceAt) return <span className="text-muted">—</span>;
  const days = Math.round((new Date(e.nextMaintenanceAt).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return <Badge tone="bad">{t('En retard de {n} j', { n: -days })}</Badge>;
  if (days <= 7) return <Badge tone="warn">{t('Dans {n} j', { n: days })}</Badge>;
  return formatDate(e.nextMaintenanceAt);
}

function EquipmentTab() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const rooms = useRooms();
  const [roomId, setRoomId] = useState('');
  const [dueOnly, setDueOnly] = useState(false);
  const [editing, setEditing] = useState<EquipmentDto | 'new' | null>(null);
  const [reporting, setReporting] = useState<EquipmentDto | null>(null);
  const list = useQuery({
    queryKey: ['equipment', roomId, dueOnly],
    queryFn: () => equipmentApi.list({ roomId: roomId || undefined, dueWithinDays: dueOnly ? 7 : undefined }),
  });
  const roomOptions = (rooms.data ?? []).map((r) => ({ value: r.id, label: r.name }));
  const fields: FieldDef[] = [
    { name: 'name', label: 'Équipement', required: true, placeholder: 'Tapis de course 3' },
    { name: 'category', label: 'Catégorie', type: 'select', required: true, options: enumOptions(EQUIPMENT_CATEGORY_LABELS) },
    { name: 'roomId', label: 'Salle', type: 'select', options: roomOptions },
    { name: 'status', label: 'État', type: 'select', required: true, options: (Object.keys(EQUIPMENT_STATUS) as EquipmentDto['status'][]).map((s) => ({ value: s, label: EQUIPMENT_STATUS[s].label })) },
    { name: 'brand', label: 'Marque' },
    { name: 'model', label: 'Modèle' },
    { name: 'serialNumber', label: 'N° de série' },
    { name: 'purchaseDate', label: 'Date d’achat', type: 'date' },
    { name: 'purchasePrice', label: 'Prix d’achat (DT)', type: 'number', min: 0, step: 0.001 },
    { name: 'warrantyUntil', label: 'Garantie jusqu’au', type: 'date' },
    { name: 'maintenanceIntervalDays', label: 'Entretien tous les (jours)', type: 'number', min: 1, step: 1 },
    { name: 'lastMaintenanceAt', label: 'Dernier entretien', type: 'date' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
  return (
    <Card>
      <CardHeader
        title={t('Équipements')}
        actions={
          <>
            <Select value={roomId} onChange={(e) => setRoomId(e.target.value)} aria-label={t('Salle')} className="w-44">
              <option value="">{t('Toutes les salles')}</option>
              {roomOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Button size="sm" variant={dueOnly ? 'primary' : 'secondary'} icon={<CalendarClock className="size-4" />} onClick={() => setDueOnly((v) => !v)} aria-pressed={dueOnly}>
              {t('Entretiens dus')}
            </Button>
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              {t('Ajouter')}
            </Button>
          </>
        }
      />
      {list.isError && <ErrorNote message={errorMessage(list.error)} onRetry={() => list.refetch()} />}
      <DataTable
        rows={list.data}
        rowKey={(e) => e.id}
        loading={list.isLoading}
        empty={<EmptyState title={dueOnly ? t('Aucun entretien à prévoir cette semaine') : t('Aucun équipement')} />}
        columns={[
          { key: 'name', header: 'Équipement', cell: (e) => <div><p className="font-medium">{e.name}</p><p className="text-xs text-muted">{[e.brand, e.model].filter(Boolean).join(' ') || t(EQUIPMENT_CATEGORY_LABELS[e.category])}</p></div> },
          { key: 'room', header: 'Salle', hideOnMobile: true, cell: (e) => e.roomName ?? '—' },
          { key: 'status', header: 'État', cell: (e) => <Badge tone={EQUIPMENT_STATUS[e.status].tone}>{t(EQUIPMENT_STATUS[e.status].label)}</Badge> },
          { key: 'next', header: 'Prochain entretien', cell: (e) => maintenanceBadge(e, t) },
          {
            key: 'actions',
            header: <span className="sr-only">{t('Actions')}</span>,
            align: 'right',
            cell: (e) => (
              <div className="flex justify-end gap-1">
                <IconButton label={t('Signaler une panne sur {name}', { name: e.name })} onClick={() => setReporting(e)}>
                  <Wrench className="size-4" />
                </IconButton>
                <IconButton label={t('Modifier {name}', { name: e.name })} onClick={() => setEditing(e)}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton
                  label={t('Supprimer {name}', { name: e.name })}
                  onClick={async () => {
                    if (!(await confirm({ title: t('Supprimer {name} ?', { name: e.name }), confirmLabel: t('Supprimer'), danger: true }))) return;
                    try {
                      await equipmentApi.remove(e.id);
                      void queryClient.invalidateQueries({ queryKey: ['equipment'] });
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
        title={editing === 'new' ? t('Nouvel équipement') : t('Modifier l’équipement')}
        submitLabel={t('Enregistrer')}
        fields={fields}
        initial={editing === 'new' || !editing ? { category: 'CARDIO', status: 'OPERATIONAL' } : { ...editing }}
        onSubmit={async (v) => {
          if (editing === 'new') await equipmentApi.create(v);
          else if (editing) await equipmentApi.update(editing.id, v);
          toast.success(t('Équipement enregistré.'));
          void queryClient.invalidateQueries({ queryKey: ['equipment'] });
        }}
      />
      <TicketForm open={Boolean(reporting)} equipment={reporting} onClose={() => setReporting(null)} />
    </Card>
  );
}

function TicketForm({ open, equipment, onClose }: { open: boolean; equipment: EquipmentDto | null; onClose: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={equipment ? t('Signaler une panne : {name}', { name: equipment.name }) : t('Signaler un problème')}
      submitLabel={t('Ouvrir le ticket')}
      size="md"
      fields={[
        { name: 'title', label: 'Problème', required: true },
        { name: 'priority', label: 'Priorité', type: 'select', required: true, options: (Object.keys(TICKET_PRIORITY) as MaintenanceTicketDto['priority'][]).map((p) => ({ value: p, label: TICKET_PRIORITY[p].label })) },
        { name: 'assignedTo', label: 'Confié à' },
        { name: 'description', label: 'Détails', type: 'textarea' },
      ]}
      initial={{ priority: 'MEDIUM' }}
      onSubmit={async (v) => {
        await maintenanceApi.create({ ...v, equipmentId: equipment?.id ?? null, roomId: equipment?.roomId ?? null });
        toast.success(t('Ticket ouvert.'));
        void queryClient.invalidateQueries({ queryKey: ['tickets'] });
        void queryClient.invalidateQueries({ queryKey: ['equipment'] });
      }}
    />
  );
}

function TicketsTab() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<TicketStatus | ''>('');
  const [creating, setCreating] = useState(false);
  const [resolving, setResolving] = useState<MaintenanceTicketDto | null>(null);
  const tickets = useQuery({ queryKey: ['tickets', status], queryFn: () => maintenanceApi.list({ status: status || undefined }) });

  const setTicketStatus = async (tk: MaintenanceTicketDto, next: TicketStatus) => {
    try {
      await maintenanceApi.update(tk.id, { status: next });
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Card>
      <CardHeader
        title={t('Pannes et maintenance')}
        actions={
          <>
            <Tabs
              value={status}
              onChange={setStatus}
              items={[
                { key: '' as TicketStatus | '', label: 'Tous' },
                { key: 'OPEN', label: 'Ouverts' },
                { key: 'IN_PROGRESS', label: 'En cours' },
                { key: 'RESOLVED', label: 'Résolus' },
              ]}
            />
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              {t('Signaler')}
            </Button>
          </>
        }
      />
      {tickets.isError && <ErrorNote message={errorMessage(tickets.error)} onRetry={() => tickets.refetch()} />}
      <DataTable
        rows={tickets.data}
        rowKey={(tk) => tk.id}
        loading={tickets.isLoading}
        empty={<EmptyState title={t('Aucun ticket')} description={t('Rien à réparer pour l’instant.')} />}
        columns={[
          { key: 'title', header: 'Problème', cell: (tk) => <div><p className="font-medium">{tk.title}</p><p className="text-xs text-muted">{tk.equipmentName ?? tk.roomName ?? t('Général')}</p></div> },
          { key: 'priority', header: 'Priorité', cell: (tk) => <Badge tone={TICKET_PRIORITY[tk.priority].tone}>{t(TICKET_PRIORITY[tk.priority].label)}</Badge> },
          { key: 'opened', header: 'Ouvert le', hideOnMobile: true, cell: (tk) => formatDateTime(tk.openedAt) },
          { key: 'assigned', header: 'Confié à', hideOnMobile: true, cell: (tk) => tk.assignedTo ?? '—' },
          { key: 'status', header: 'Statut', cell: (tk) => <Badge tone={TICKET_STATUS[tk.status].tone}>{t(TICKET_STATUS[tk.status].label)}</Badge> },
          {
            key: 'actions',
            header: <span className="sr-only">{t('Actions')}</span>,
            align: 'right',
            cell: (tk) =>
              tk.status !== 'RESOLVED' ? (
                <div className="flex justify-end gap-1">
                  {tk.status === 'OPEN' && (
                    <Button size="sm" variant="ghost" onClick={() => void setTicketStatus(tk, 'IN_PROGRESS')}>
                      {t('Prendre en charge')}
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => setResolving(tk)}>
                    {t('Résoudre')}
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-muted">{tk.cost !== null ? formatTND(tk.cost) : ''}</span>
              ),
          },
        ]}
      />
      <TicketForm open={creating} equipment={null} onClose={() => setCreating(false)} />
      <FormModal
        open={Boolean(resolving)}
        onClose={() => setResolving(null)}
        title={t('Clore le ticket')}
        description={t('Un coût saisi est enregistré automatiquement dans les dépenses (maintenance).')}
        submitLabel={t('Marquer comme résolu')}
        size="md"
        fields={[
          { name: 'resolution', label: 'Intervention réalisée', type: 'textarea', required: true },
          { name: 'cost', label: 'Coût (DT)', type: 'number', min: 0, step: 0.001 },
        ]}
        onSubmit={async (v) => {
          if (!resolving) return;
          await maintenanceApi.update(resolving.id, { ...v, status: 'RESOLVED' });
          toast.success(t('Ticket résolu.'));
          void queryClient.invalidateQueries({ queryKey: ['tickets'] });
          void queryClient.invalidateQueries({ queryKey: ['equipment'] });
        }}
      />
    </Card>
  );
}

function LockerAssignModal({ locker, onClose }: { locker: LockerDto; onClose: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [until, setUntil] = useState(locker.assignedUntil?.slice(0, 10) ?? '');
  const members = useQuery({ queryKey: ['members', 'locker', search], queryFn: () => membersApi.list({ search, pageSize: 6 }), enabled: search.trim().length >= 2 });
  const save = async (body: Record<string, unknown>, message: string) => {
    try {
      await lockersApi.assign(locker.id, body);
      toast.success(message);
      void queryClient.invalidateQueries({ queryKey: ['lockers'] });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <Modal open onClose={onClose} title={t('Casier {n}', { n: locker.number })} description={locker.memberName ? t('Attribué à {name}', { name: locker.memberName }) : t(LOCKER_STATUS_LABELS[locker.status])} size="md">
      <div className="flex flex-col gap-4">
 <Input label={t('Attribuer jusqu’au')} type="date" min={isoDay()} value={until} onChange={(e) => setUntil(e.target.value)} />
        <Input label={t('Membre')} placeholder={t('Nom, téléphone ou code membre')} value={search} onChange={(e) => setSearch(e.target.value)} />
        {members.data && (
          <ul className="divide-y divide-line rounded-lg ring-1 ring-line">
            {members.data.items.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm">
                  {fullName(m)} <span className="text-xs text-muted">{m.memberCode}</span>
                </span>
                <Button size="sm" onClick={() => void save({ memberId: m.id, memberName: fullName(m), assignedUntil: until || null, status: 'OCCUPIED' }, t('Casier {n} attribué.', { n: locker.number }))}>
                  {t('Attribuer')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {locker.memberId && (
            <Button variant="secondary" onClick={() => void save({ memberId: null, memberName: null, assignedUntil: null, status: 'FREE' }, t('Casier {n} libéré.', { n: locker.number }))}>
              {t('Libérer le casier')}
            </Button>
          )}
          {locker.status !== 'OUT_OF_ORDER' ? (
            <Button variant="ghost" onClick={() => void save({ memberId: null, status: 'OUT_OF_ORDER' }, t('Casier {n} hors service.', { n: locker.number }))}>
              {t('Mettre hors service')}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => void save({ memberId: null, status: 'FREE' }, t('Casier {n} remis en service.', { n: locker.number }))}>
              {t('Remettre en service')}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function LockersTab() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const rooms = useRooms();
  const [roomId, setRoomId] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<LockerDto | null>(null);
  const lockers = useQuery({ queryKey: ['lockers', roomId], queryFn: () => lockersApi.list({ roomId: roomId || undefined }) });
  const list = [...(lockers.data ?? [])].sort((a, b) => a.number.localeCompare(b.number, 'fr', { numeric: true }));
  const counts = { FREE: 0, OCCUPIED: 0, OUT_OF_ORDER: 0 };
  list.forEach((l) => counts[l.status]++);
  const expired = (l: LockerDto) => Boolean(l.assignedUntil && l.assignedUntil.slice(0, 10) < isoDay());

  return (
    <Card>
      <CardHeader
        title={t('Casiers')}
        description={t('{free} libres, {occupied} occupés, {broken} hors service', { free: counts.FREE, occupied: counts.OCCUPIED, broken: counts.OUT_OF_ORDER })}
        actions={
          <>
            <Select value={roomId} onChange={(e) => setRoomId(e.target.value)} aria-label={t('Vestiaire')} className="w-44">
              <option value="">{t('Tous les vestiaires')}</option>
              {rooms.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              {t('Créer des casiers')}
            </Button>
          </>
        }
      />
      {lockers.isError && <ErrorNote message={errorMessage(lockers.error)} onRetry={() => lockers.refetch()} />}
      {list.length === 0 && !lockers.isLoading ? (
        <EmptyState icon={<Lock className="size-8" />} title={t('Aucun casier')} description={t('Créez une rangée de casiers numérotés en une fois (par exemple H-1 à H-40).')} />
      ) : (
        <ul className="grid grid-cols-4 gap-2 px-5 pb-5 sm:grid-cols-8 lg:grid-cols-12" aria-label={t('Plan des casiers')}>
          {list.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => setSelected(l)}
                title={l.memberName ? `${l.number} : ${l.memberName}` : `${l.number} : ${t(LOCKER_STATUS_LABELS[l.status])}`}
                className={clsx(
                  'flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded-lg text-xs font-semibold ring-1 transition-shadow hover:ring-2',
                  l.status === 'FREE' && 'text-fg-2 ring-line',
                  l.status === 'OCCUPIED' && (expired(l) ? 'bg-[#fab219]/15 text-warn ring-[#fab219]/45' : 'bg-[var(--series-1)]/15 text-fg ring-[var(--series-1)]/40'),
                  l.status === 'OUT_OF_ORDER' && 'bg-card-2 text-muted line-through ring-line',
                )}
              >
                <span className="tabular">{l.number}</span>
                <span className="max-w-full truncate px-1 text-[10px] font-normal">
                  {l.status === 'OCCUPIED' ? (expired(l) ? t('Échu') : l.memberName?.split(' ')[0]) : t(LOCKER_STATUS_LABELS[l.status])}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <FormModal
        open={creating}
        onClose={() => setCreating(false)}
        title={t('Créer des casiers')}
        submitLabel={t('Créer')}
        size="md"
        fields={[
          { name: 'roomId', label: 'Vestiaire', type: 'select', options: (rooms.data ?? []).map((r) => ({ value: r.id, label: r.name })) },
          { name: 'prefix', label: 'Préfixe', placeholder: 'H-' },
          { name: 'from', label: 'Du numéro', type: 'number', required: true, min: 1, step: 1 },
          { name: 'to', label: 'Au numéro', type: 'number', required: true, min: 1, step: 1 },
        ]}
        initial={{ from: 1, to: 20 }}
        onSubmit={async (v) => {
          const created = await lockersApi.createRange({ roomId: (v.roomId as string) ?? null, prefix: (v.prefix as string) ?? undefined, from: Number(v.from), to: Number(v.to) });
          toast.success(t('{n} casiers créés.', { n: created.length }));
          void queryClient.invalidateQueries({ queryKey: ['lockers'] });
        }}
      />
      {selected && <LockerAssignModal locker={selected} onClose={() => setSelected(null)} />}
    </Card>
  );
}

export function FacilityPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabKey>('equipment');
  return (
    <div>
      <PageHeader title={t('Salles et équipements')} description={t('Parc machines, entretiens préventifs, pannes et casiers.')} />
      <Tabs
        className="mb-5 w-fit"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'equipment', label: 'Équipements' },
          { key: 'tickets', label: 'Pannes' },
          { key: 'lockers', label: 'Casiers' },
          { key: 'rooms', label: 'Salles' },
        ]}
      />
      {tab === 'rooms' && <RoomsTab />}
      {tab === 'equipment' && <EquipmentTab />}
      {tab === 'tickets' && <TicketsTab />}
      {tab === 'lockers' && <LockersTab />}
    </div>
  );
}
