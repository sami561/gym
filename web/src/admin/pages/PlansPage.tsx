import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Star, Tags, Trash2 } from 'lucide-react';
import { plansApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../api/auth';
import type { CreatePlanRequest, PlanDto } from '../../api/types';
import { Badge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, EmptyState, ErrorNote, PageHeader } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { FormModal, type FieldDef } from '../../components/ui/FormModal';
import { useConfirm } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { formatTND } from '../../lib/format';
import { useI18n } from '../../i18n';

const FIELDS: FieldDef[] = [
  { name: 'name', label: 'Nom de l’offre', required: true },
  { name: 'durationDays', label: 'Durée (jours)', type: 'number', required: true, min: 1, step: 1 },
  { name: 'price', label: 'Prix (DT)', type: 'number', required: true, min: 0, step: 0.001 },
  { name: 'sortOrder', label: 'Ordre d’affichage', type: 'number', step: 1 },
  { name: 'description', label: 'Description', type: 'textarea' },
  { name: 'features', label: 'Avantages (un par ligne)', type: 'list' },
  { name: 'isFeatured', label: 'Mettre en avant sur le site', type: 'checkbox' },
  { name: 'isActive', label: 'En vente', type: 'checkbox', hint: 'Une offre retirée de la vente reste valable pour les abonnements en cours.' },
];

export function PlansPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const isAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<PlanDto | 'new' | null>(null);
  const query = useQuery({ queryKey: ['plans', 'admin'], queryFn: () => plansApi.list(true) });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['plans'] });
    void queryClient.invalidateQueries({ queryKey: ['public', 'plans'] });
  };

  const sorted = [...(query.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.durationDays - b.durationDays);

  return (
    <div>
      <PageHeader
        title={t('Offres et tarifs')}
        description={t('Les offres en vente apparaissent sur le site et dans l’application.')}
        actions={
          isAdmin && (
            <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              {t('Nouvelle offre')}
            </Button>
          )
        }
      />
      {query.isError && <ErrorNote message={errorMessage(query.error)} onRetry={() => query.refetch()} />}
      <Card>
        <DataTable
          rows={sorted}
          rowKey={(p) => p.id}
          loading={query.isLoading}
          empty={<EmptyState icon={<Tags className="size-8" />} title={t('Aucune offre')} description={t('Créez l’offre mensuelle, trimestrielle et annuelle.')} />}
          columns={[
            {
              key: 'name',
              header: 'Offre',
              cell: (p) => (
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  {p.isFeatured && <Star className="size-3.5 fill-current text-warn" aria-label={t('Mise en avant')} />}
                </div>
              ),
            },
            { key: 'duration', header: 'Durée', cell: (p) => t('{n} jours', { n: p.durationDays }) },
            { key: 'features', header: 'Avantages', hideOnMobile: true, cell: (p) => <span className="text-fg-2">{p.features.length ? p.features.join(', ') : '—'}</span> },
            { key: 'status', header: 'Statut', cell: (p) => (p.isActive ? <Badge tone="good">{t('En vente')}</Badge> : <Badge>{t('Retirée')}</Badge>) },
            { key: 'price', header: 'Prix', align: 'right', cell: (p) => <span className="font-semibold">{formatTND(p.price)}</span> },
            {
              key: 'actions',
              header: <span className="sr-only">{t('Actions')}</span>,
              align: 'right',
              cell: (p) =>
                isAdmin && (
                  <div className="flex justify-end gap-1">
                    <IconButton label={t('Modifier {name}', { name: p.name })} onClick={() => setEditing(p)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton
                      label={t('Supprimer {name}', { name: p.name })}
                      onClick={async () => {
                        const ok = await confirm({
                          title: t('Supprimer l’offre {name} ?', { name: p.name }),
                          message: t('Si elle a déjà été vendue, elle est simplement retirée de la vente.'),
                          confirmLabel: t('Supprimer'),
                          danger: true,
                        });
                        if (!ok) return;
                        try {
                          await plansApi.remove(p.id);
                          toast.success(t('Offre supprimée.'));
                          refresh();
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
        title={editing === 'new' ? t('Nouvelle offre') : t('Modifier l’offre')}
        submitLabel={editing === 'new' ? t('Créer l’offre') : t('Enregistrer')}
        fields={FIELDS}
        initial={editing === 'new' || !editing ? { isActive: true, durationDays: 30, sortOrder: (query.data?.length ?? 0) + 1 } : { ...editing }}
        onSubmit={async (v) => {
          const body = { ...v, features: v.features ?? [] } as unknown as CreatePlanRequest;
          if (editing === 'new') await plansApi.create(body);
          else if (editing) await plansApi.update(editing.id, body);
          toast.success(editing === 'new' ? t('Offre créée.') : t('Offre enregistrée.'));
          refresh();
        }}
      />
    </div>
  );
}
