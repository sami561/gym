import { Role, coachPhotoUrl } from '@app/common';
import {
  DEV_ADMIN_PASSWORD,
  bootstrapAdminPassword,
  changesAvatarUrl,
  isActiveAdmin,
  removesActiveAdmin,
} from './user-rules';

describe('user rules', () => {
  describe('avatarUrl of an update', () => {
    const id = '3c5e8a52-4f0e-4c1e-9b7a-0a1b2c3d4e05';
    const other = '3c5e8a52-4f0e-4c1e-9b7a-0a1b2c3d4e06';
    const uploaded = coachPhotoUrl(id, new Date('2026-11-03T09:00:00.000Z'));
    const coach = (avatarUrl: string | null) => ({ id, avatarUrl });

    it('a URL typed by hand, or null, changes it when it differs', () => {
      expect(changesAvatarUrl(coach(null), 'https://cdn.example.com/leila.jpg')).toBe(true);
      expect(changesAvatarUrl(coach(uploaded), 'https://cdn.example.com/leila.jpg')).toBe(true);
      expect(changesAvatarUrl(coach(uploaded), null)).toBe(true);
      expect(changesAvatarUrl(coach('https://cdn.example.com/old.jpg'), null)).toBe(true);
      // another coach's photo URL is just a URL
      expect(changesAvatarUrl(coach(uploaded), coachPhotoUrl(other, new Date()))).toBe(true);
    });

    it('absent or unchanged values do not', () => {
      expect(changesAvatarUrl(coach(uploaded), undefined)).toBe(false);
      expect(changesAvatarUrl(coach(null), null)).toBe(false);
      expect(changesAvatarUrl(coach('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg')).toBe(false);
    });

    it('the own photo URL, whatever its version, never does (only the photo routes write it)', () => {
      expect(changesAvatarUrl(coach(uploaded), coachPhotoUrl(id, new Date('2026-11-01T09:00:00.000Z')))).toBe(false);
      expect(changesAvatarUrl(coach(uploaded), `/api/public/coaches/${id}/photo`)).toBe(false);
      // a stale form after the photo was deleted, or replaced by a typed URL
      expect(changesAvatarUrl(coach(null), uploaded)).toBe(false);
      expect(changesAvatarUrl(coach('https://cdn.example.com/a.jpg'), uploaded)).toBe(false);
    });
  });

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
