import { Role } from '@app/common';
import { DEV_ADMIN_PASSWORD, bootstrapAdminPassword, isActiveAdmin, removesActiveAdmin } from './user-rules';

describe('user rules', () => {
  describe('last admin', () => {
    const admin = { role: Role.ADMIN, isActive: true };

    it('flags the demotion and the deactivation of an active admin', () => {
      expect(removesActiveAdmin(admin, { role: Role.STAFF })).toBe(true);
      expect(removesActiveAdmin(admin, { isActive: false })).toBe(true);
      expect(removesActiveAdmin(admin, { role: Role.ADMIN, isActive: false })).toBe(true);
    });

    it('lets every other change through without the check', () => {
      expect(removesActiveAdmin(admin, {})).toBe(false);
      expect(removesActiveAdmin(admin, { role: Role.ADMIN, isActive: true })).toBe(false);
      expect(removesActiveAdmin({ role: Role.ADMIN, isActive: false }, { role: Role.MEMBER })).toBe(false);
      expect(removesActiveAdmin({ role: Role.STAFF, isActive: true }, { isActive: false })).toBe(false);
    });

    it('only an active admin counts for a deletion', () => {
      expect(isActiveAdmin(admin)).toBe(true);
      expect(isActiveAdmin({ role: Role.ADMIN, isActive: false })).toBe(false);
      expect(isActiveAdmin({ role: Role.COACH, isActive: true })).toBe(false);
    });
  });

  describe('bootstrap admin password', () => {
    it('keeps the documented default outside production', () => {
      expect(bootstrapAdminPassword('development', '')).toBe(DEV_ADMIN_PASSWORD);
      expect(bootstrapAdminPassword(undefined, undefined)).toBe(DEV_ADMIN_PASSWORD);
      expect(bootstrapAdminPassword('test', 'local-secret')).toBe('local-secret');
    });

    it('requires ADMIN_PASSWORD in production, with a French message', () => {
      expect(() => bootstrapAdminPassword('production', '')).toThrow(/ADMIN_PASSWORD est obligatoire en production/);
      expect(() => bootstrapAdminPassword('production', undefined)).toThrow(/premier administrateur/);
    });

    it('uses ADMIN_PASSWORD in production when it is set', () => {
      expect(bootstrapAdminPassword('production', 'S3cure-Meliora-Owner')).toBe('S3cure-Meliora-Owner');
    });
  });
});
