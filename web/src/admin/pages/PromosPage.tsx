import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgePercent, Pencil, Plus, Trash2 } from 'lucide-react';
import { promosApi } from '../../api/endpoints-ops';
import { errorMessage } from '../../api/client';
import type { PromoCodeDto } from '../../api/types-ops';
import { Badge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, EmptyState, ErrorNote, PageHeader } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { enumOptions, FormModal, type FieldDef } from '../../components/ui/FormModal';
import { useConfirm } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { formatDate, formatTND, isoDay } from '../../lib/format';
import { PROMO_TYPE_LABELS } from '../../lib/labels-ops';
import { useI18n, type TFunction } from '../../i18n';

const FIELDS: FieldDef[] = [
  { name: 'code', label: 'Code', required: true, placeholder: 'RENTREE26', hint: 'Lettres et chiffres, saisi par l’accueil à la vente.' },
  { name: 'type', label: 'Type de remise', type: 'select', required: true, options: enumOptions(PROMO_TYPE_LABELS) },
  { name: 'value', label: 'Valeur', type: 'number', required: true, min: 0, step: 0.001, hint: 'Pourcentage (0-100) ou montant en DT' },
  { name: 'maxUses', label: 'Utilisations max.', type: 'number', min: 1, step: 1, hint: 'Vide = illimité' },
  { name: 'validFrom', label: 'Valable du', type: 'date' },
  { name: 'validUntil', label: 'Valable jusqu’au', type: 'date' },
  { name: 'description', label: 'Description interne', type: 'textarea' },
  { name: 'isActive', label: 'Actif', type: 'checkbox' },
];

function promoState(p: PromoCodeDto, t: TFunction) {
  const today = isoDay();
  if (!p.isActive) return <Badge>{t('Désactivé')}</Badge>;
  if (p.validUntil && p.validUntil < today) return <Badge>{t('Expiré')}</Badge>;
  if (p.maxUses !== null && p.uses >= p.maxUses) return <Badge tone="warn">{t('Épuisé')}</Badge>;
  if (p.validFrom && p.validFrom > today) return <Badge tone="info">{t('À venir')}</Badge>;
  return <Badge tone="good">{t('Actif')}</Badge>;
}

export function PromosPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<PromoCodeDto | 'new' | null>(null);
  const query = useQuery({ queryKey: ['promos'], queryFn: promosApi.list });

  return (
    <div>
      <PageHeader
        title={t('Codes promo')}
        description={t('Remises appliquées à la souscription d’un abonnement.')}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            {t('Nouveau code')}
          </Button>
        }
      />
      {query.isError && <ErrorNote message={errorMessage(query.error)} onRetry={() => query.refetch()} />}
      <Card>
        <DataTable
          rows={query.data}
          rowKey={(p) => p.id}
          loading={query.isLoading}
          empty={<EmptyState icon={<BadgePercent className="size-8" />} title={t('Aucun code promo')} description={t('Créez un code pour une campagne Instagram ou la rentrée.')} />}
          columns={[
            { key: 'code', header: 'Code', cell: (p) => <span className="font-semibold tracking-wide">{p.code}</span> },
            { key: 'value', header: 'Remise', cell: (p) => (p.type === 'PERCENT' ? `${p.value} %` : formatTND(p.value)) },
            {
              key: 'validity',
              header: 'Validité',
              hideOnMobile: true,
              cell: (p) => (p.validFrom || p.validUntil ? `${p.validFrom ? formatDate(p.validFrom) : '…'} → ${p.validUntil ? formatDate(p.validUntil) : '…'}` : t('Sans limite')),
            },
            { key: 'uses', header: 'Utilisations', align: 'right', cell: (p) => `${p.uses}${p.maxUses !== null ? ` / ${p.maxUses}` : ''}` },
            { key: 'state', header: 'État', cell: (p) => promoState(p, t) },
            {
              key: 'actions',
              header: <span className="sr-only">{t('Actions')}</span>,
              align: 'right',
              cell: (p) => (
                <div className="flex justify-end gap-1">
                  <IconButton label={t('Modifier {name}', { name: p.code })} onClick={() => setEditing(p)}>
                    <Pencil className="size-4" />
                  </IconButton>
                  <IconButton
                    label={t('Supprimer {name}', { name: p.code })}
                    onClick={async () => {
                      if (!(await confirm({ title: t('Supprimer le code {code} ?', { code: p.code }), confirmLabel: t('Supprimer'), danger: true }))) return;
                      try {
                        await promosApi.remove(p.id);
                        toast.success(t('Code supprimé.'));
                        void queryClient.invalidateQueries({ queryKey: ['promos'] });
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
        title={editing === 'new' ? t('Nouveau code promo') : t('Modifier le code promo')}
        submitLabel={editing === 'new' ? t('Créer le code') : t('Enregistrer')}
        fields={FIELDS}
        initial={editing === 'new' || !editing ? { type: 'PERCENT', isActive: true } : { ...editing }}
        onSubmit={async (v) => {
          const body = { ...v, code: String(v.code).toUpperCase() };
          if (editing === 'new') await promosApi.create(body);
          else if (editing) await promosApi.update(editing.id, body);
          toast.success(t('Code promo enregistré.'));
          void queryClient.invalidateQueries({ queryKey: ['promos'] });
        }}
      />
    </div>
  );
}
