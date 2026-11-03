import { Role, coachPhotoOwner } from '@app/common';

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

/**
 * Whether the avatarUrl of an update changes the column. A URL typed by hand, or null, does when it differs from
 * the current value (and then replaces the uploaded photo). The user's own coach photo URL never does, whatever
 * its version: only the photo routes write it, and a form may send back the value it loaded, maybe older.
 */
export function changesAvatarUrl(
  user: { id: string; avatarUrl: string | null },
  requested: string | null | undefined,
): requested is string | null {
  if (requested === undefined || requested === user.avatarUrl) return false;
  return coachPhotoOwner(requested) !== user.id;
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
