import { Role } from '@app/common';

interface AdminCandidate {
  role: Role;
  isActive: boolean;
}

export function isActiveAdmin(user: AdminCandidate): boolean {
  return user.role === Role.ADMIN && user.isActive;
}

/** The change demotes or deactivates an active admin (deleting one is checked with isActiveAdmin). */
export function removesActiveAdmin(user: AdminCandidate, change: { role?: Role; isActive?: boolean }): boolean {
  if (!isActiveAdmin(user)) return false;
  return (change.role !== undefined && change.role !== Role.ADMIN) || change.isActive === false;
}

/** Bootstrap admin password outside production (documented in backend/.env.example). */
export const DEV_ADMIN_PASSWORD = 'Meliora2026!';

/**
 * Password of the first admin, created when no admin exists. Outside production the dev default is
 * fine; in production ADMIN_PASSWORD is required, otherwise auth-service stops at boot. (A weak or
 * example value is already refused in production by assertSecureConfig when the env is loaded.)
 */
export function bootstrapAdminPassword(nodeEnv: string | undefined, configured: string | undefined): string {
  if (configured) return configured;
  if (nodeEnv === 'production') {
    throw new Error(
      'ADMIN_PASSWORD est obligatoire en production : aucun administrateur n’existe encore. ' +
        'Définissez le mot de passe du premier administrateur puis redémarrez auth-service.',
    );
  }
  return DEV_ADMIN_PASSWORD;
}
