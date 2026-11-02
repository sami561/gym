import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../api/auth';
import type { Role } from '../api/types';
import { EmptyState } from '../components/ui/Card';
import { PageSpinner } from '../components/ui/Spinner';
import { useI18n } from '../i18n';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  const { t } = useI18n();
  if (status === 'loading') return <PageSpinner label={t('Ouverture de la session…')} />;
  if (status === 'anonymous') return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useI18n();
  if (!user || !roles.includes(user.role)) {
    return (
      <EmptyState
        icon={<ShieldAlert className="size-8" />}
        title={t('Accès réservé')}
        description={t('Cette page est réservée à un autre rôle. Demandez l’accès à l’administrateur de la salle.')}
      />
    );
  }
  return <>{children}</>;
}
