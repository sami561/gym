import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, UserCog } from 'lucide-react';
import { usersApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../api/auth';
import type { Role, UserDto } from '../../api/types';
import { Badge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, EmptyState, ErrorNote, PageHeader } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { useConfirm } from '../../components/ui/Modal';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import { formatDate, fullName, ROLE_LABELS } from '../../lib/format';
import { useI18n } from '../../i18n';
import { AccountAvatar } from '../photos/AccountAvatar';
import { TeamAccountModal } from './TeamAccountModal';

export function TeamPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [role, setRole] = useState<Role | 'ALL'>('ALL');
  const [editing, setEditing] = useState<UserDto | 'new' | null>(null);
  const query = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list() });
  const staff = (query.data ?? []).filter((u) => u.role !== 'MEMBER' && (role === 'ALL' || u.role === role));

  return (
    <div>
      <PageHeader
        title={t('Comptes équipe')}
        description={t('Qui peut se connecter au back-office, avec quel rôle. Les coachs apparaissent sur le site.')}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            {t('Nouveau compte')}
          </Button>
        }
      />
      <Tabs
        className="mb-4 w-fit"
        value={role}
        onChange={setRole}
        items={[
          { key: 'ALL', label: 'Tous' },
          { key: 'ADMIN', label: 'Administrateurs' },
          { key: 'STAFF', label: 'Accueil' },
          { key: 'COACH', label: 'Coachs' },
        ]}
      />
      {query.isError && <ErrorNote message={errorMessage(query.error)} onRetry={() => query.refetch()} />}
      <Card>
        <DataTable
          rows={staff}
          rowKey={(u) => u.id}
          loading={query.isLoading}
          empty={<EmptyState icon={<UserCog className="size-8" />} title={t('Aucun compte')} />}
          columns={[
            {
              key: 'name',
              header: 'Nom',
              cell: (u) => (
                <div className="flex min-w-0 items-center gap-3">
                  <AccountAvatar name={fullName(u)} url={u.avatarUrl} decorative />
                  <div className="min-w-0">
                    <p className="font-medium">{fullName(u)}</p>
                    <p className="text-xs text-muted">{u.email}</p>
                  </div>
                </div>
              ),
            },
            { key: 'role', header: 'Rôle', cell: (u) => <Badge tone={u.role === 'ADMIN' ? 'brand' : u.role === 'COACH' ? 'info' : 'neutral'}>{t(ROLE_LABELS[u.role])}</Badge> },
            { key: 'specialty', header: 'Spécialité', hideOnMobile: true, cell: (u) => u.specialty ?? '—' },
            { key: 'since', header: 'Depuis', hideOnMobile: true, cell: (u) => formatDate(u.createdAt) },
            { key: 'active', header: 'Statut', cell: (u) => (u.isActive ? <Badge tone="good">{t('Actif')}</Badge> : <Badge>{t('Désactivé')}</Badge>) },
            {
              key: 'actions',
              header: <span className="sr-only">{t('Actions')}</span>,
              align: 'right',
              cell: (u) => (
                <div className="flex justify-end gap-1">
                  <IconButton label={t('Modifier {name}', { name: fullName(u) })} onClick={() => setEditing(u)}>
                    <Pencil className="size-4" />
                  </IconButton>
                  {u.id !== user?.id && (
                    <IconButton
                      label={t('Supprimer {name}', { name: fullName(u) })}
                      onClick={async () => {
                        if (!(await confirm({ title: t('Supprimer le compte de {name} ?', { name: fullName(u) }), message: t('La personne ne pourra plus se connecter.'), confirmLabel: t('Supprimer'), danger: true }))) return;
                        try {
                          await usersApi.remove(u.id);
                          toast.success(t('Compte supprimé.'));
                          void queryClient.invalidateQueries({ queryKey: ['users'] });
                        } catch (err) {
                          toast.error(errorMessage(err));
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>
      <TeamAccountModal open={editing !== null} account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
    </div>
  );
}
