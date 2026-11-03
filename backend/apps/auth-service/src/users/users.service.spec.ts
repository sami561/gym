import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { EVENTS, EventBus, Role, coachPhotoUrl } from '@app/common';
import { RefreshSessionsService } from '../sessions/refresh-sessions.service';
import { User } from './user.entity';
import { UserPhotoEntity } from './user-photo.entity';
import { UsersService } from './users.service';

const ADMIN_ID = '1f6d8a52-4f0e-4c1e-9b7a-0a1b2c3d4e01';
const MEMBER_ID = '1f6d8a52-4f0e-4c1e-9b7a-0a1b2c3d4e02';
const LAST_ADMIN = 'Impossible : c’est le dernier administrateur actif.';

function makeUser(id: string, role: Role, patch: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id,
    email: `${role.toLowerCase()}@example.com`,
    phone: null,
    passwordHash: 'hash',
    role,
    firstName: 'Prénom',
    lastName: 'Nom',
    avatarUrl: null,
    specialty: null,
    bio: null,
    isActive: true,
    tokenVersion: 0,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...patch,
  });
}

function setup(target: User | null, activeAdmins: number) {
  const manager = {
    findOne: jest.fn().mockResolvedValue(target),
    query: jest.fn(),
    count: jest.fn().mockResolvedValue(activeAdmins),
    exists: jest.fn().mockResolvedValue(false),
    save: jest.fn(async <T>(entity: T) => entity),
    delete: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(async (_isolation: string, work: (m: typeof manager) => unknown) => work(manager)),
  };
  const sessions = { revokeAll: jest.fn() };
  const events = { publish: jest.fn() };
  const service = new UsersService(
    {} as Repository<User>,
    dataSource as unknown as DataSource,
    sessions as unknown as RefreshSessionsService,
    events as unknown as EventBus,
  );
  const advisoryLocks = () => manager.query.mock.calls.filter(([sql]) => String(sql).includes('pg_advisory_xact_lock'));
  return { manager, dataSource, sessions, events, service, advisoryLocks };
}

describe('UsersService — last active admin', () => {
  it('demotes an admin under the row lock and the last-admin lock, in READ COMMITTED', async () => {
    const { manager, dataSource, service, advisoryLocks } = setup(makeUser(ADMIN_ID, Role.ADMIN), 2);
    const result = await service.update({ id: ADMIN_ID, data: { role: Role.STAFF } });
    expect(result.role).toBe(Role.STAFF);
    expect(dataSource.transaction).toHaveBeenCalledWith('READ COMMITTED', expect.any(Function));
    expect(manager.findOne).toHaveBeenCalledWith(User, { where: { id: ADMIN_ID }, lock: { mode: 'pessimistic_write' } });
    expect(advisoryLocks()).toHaveLength(1);
    // The admins are counted only once the lock is held.
    expect(manager.query.mock.invocationCallOrder[0]).toBeLessThan(manager.count.mock.invocationCallOrder[0]);
    expect(manager.count).toHaveBeenCalledWith(User, { where: { role: Role.ADMIN, isActive: true } });
  });

  it('refuses to demote, deactivate or delete the last active admin', async () => {
    for (const change of [{ role: Role.MEMBER }, { isActive: false }]) {
      const { manager, service } = setup(makeUser(ADMIN_ID, Role.ADMIN), 1);
      await expect(service.update({ id: ADMIN_ID, data: change })).rejects.toThrow(new ConflictException(LAST_ADMIN));
      expect(manager.save).not.toHaveBeenCalled();
    }
    const { manager, events, service } = setup(makeUser(ADMIN_ID, Role.ADMIN), 1);
    await expect(service.remove(ADMIN_ID)).rejects.toThrow(LAST_ADMIN);
    expect(manager.delete).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('deletes an admin when another active one remains', async () => {
    const { manager, events, service, advisoryLocks } = setup(makeUser(ADMIN_ID, Role.ADMIN), 2);
    await expect(service.remove(ADMIN_ID)).resolves.toEqual({ ok: true });
    expect(advisoryLocks()).toHaveLength(1);
    expect(manager.delete).toHaveBeenCalledWith(User, ADMIN_ID);
    expect(events.publish).toHaveBeenCalledWith(EVENTS.userDeleted, { userId: ADMIN_ID });
  });

  it('does not take the last-admin lock for other changes', async () => {
    const member = setup(makeUser(MEMBER_ID, Role.MEMBER), 1);
    await member.service.update({ id: MEMBER_ID, data: { firstName: 'Amel' } });
    await member.service.remove(MEMBER_ID);
    expect(member.advisoryLocks()).toHaveLength(0);
    // Renaming an admin, or an already deactivated one, is not a removal either.
    const admin = setup(makeUser(ADMIN_ID, Role.ADMIN), 1);
    await admin.service.update({ id: ADMIN_ID, data: { firstName: 'Sami', role: Role.ADMIN } });
    const inactive = setup(makeUser(ADMIN_ID, Role.ADMIN, { isActive: false }), 1);
    await inactive.service.update({ id: ADMIN_ID, data: { role: Role.STAFF } });
    expect(admin.advisoryLocks()).toHaveLength(0);
    expect(inactive.advisoryLocks()).toHaveLength(0);
  });

  it('answers 404 for an unknown or missing id without querying with an empty condition', async () => {
    const { manager, service } = setup(null, 2);
    await expect(service.update({ id: MEMBER_ID, data: { firstName: 'X' } })).rejects.toBeInstanceOf(NotFoundException);
    manager.findOne.mockClear();
    await expect(service.remove(undefined as unknown as string)).rejects.toBeInstanceOf(NotFoundException);
    expect(manager.findOne).not.toHaveBeenCalled();
  });
});

describe('UsersService — sessions', () => {
  it('a password reset by staff ends every session of the user', async () => {
    const target = makeUser(MEMBER_ID, Role.MEMBER);
    const { manager, sessions, service } = setup(target, 1);
    await service.update({ id: MEMBER_ID, data: { password: 'Nouveau-mot-de-passe' } });
    expect(target.tokenVersion).toBe(1);
    expect(target.passwordHash).not.toBe('hash');
    expect(sessions.revokeAll).toHaveBeenCalledWith(MEMBER_ID, manager);
  });

  it('a deactivation ends every session; a profile edit does not', async () => {
    const deactivated = makeUser(MEMBER_ID, Role.MEMBER);
    const first = setup(deactivated, 1);
    await first.service.update({ id: MEMBER_ID, data: { isActive: false } });
    expect(deactivated).toMatchObject({ isActive: false, tokenVersion: 1 });
    expect(first.sessions.revokeAll).toHaveBeenCalledWith(MEMBER_ID, first.manager);

    const edited = makeUser(MEMBER_ID, Role.MEMBER);
    const second = setup(edited, 1);
    await second.service.update({ id: MEMBER_ID, data: { phone: '+216 20 000 000' } });
    expect(edited.tokenVersion).toBe(0);
    expect(second.sessions.revokeAll).not.toHaveBeenCalled();
  });

  it('refuses an e-mail used by another account', async () => {
    const { manager, service } = setup(makeUser(MEMBER_ID, Role.MEMBER), 1);
    manager.exists.mockResolvedValueOnce(true);
    await expect(service.update({ id: MEMBER_ID, data: { email: ' Autre@Example.com ' } })).rejects.toThrow(
      'Un compte existe déjà avec cet e-mail.',
    );
    expect(manager.exists).toHaveBeenCalledWith(User, { where: { email: 'autre@example.com' } });
  });

  it('refuses to create an account with an e-mail already used', async () => {
    const repository = { exists: jest.fn().mockResolvedValue(true), create: jest.fn(), save: jest.fn() };
    const events = { publish: jest.fn() };
    const service = new UsersService(
      repository as unknown as Repository<User>,
      {} as DataSource,
      {} as RefreshSessionsService,
      events as unknown as EventBus,
    );
    const request = { email: ' Amira@Example.com ', password: 'Membre2026!', role: Role.MEMBER, firstName: 'Amira', lastName: 'J.' };
    await expect(service.create(request)).rejects.toThrow(new ConflictException('Un compte existe déjà avec cet e-mail.'));
    expect(repository.exists).toHaveBeenCalledWith({ where: { email: 'amira@example.com' } });
    expect(repository.save).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('a login writes lastLoginAt only, so it cannot undo a deactivation or a password change', async () => {
    const repository = { update: jest.fn(), save: jest.fn() };
    const service = new UsersService(
      repository as unknown as Repository<User>,
      {} as DataSource,
      {} as RefreshSessionsService,
      {} as EventBus,
    );
    const at = new Date('2026-11-02T10:00:00.000Z');
    await service.recordLogin(MEMBER_ID, at);
    expect(repository.update).toHaveBeenCalledWith({ id: MEMBER_ID }, { lastLoginAt: at });
    expect(repository.save).not.toHaveBeenCalled();
  });
});

describe('UsersService — avatarUrl and the uploaded coach photo', () => {
  const COACH_ID = '1f6d8a52-4f0e-4c1e-9b7a-0a1b2c3d4e03';
  const uploaded = coachPhotoUrl(COACH_ID, new Date('2026-11-03T09:00:00.000Z'));
  const photoDeletes = (manager: ReturnType<typeof setup>['manager']) =>
    (manager.delete.mock.calls as unknown[][]).filter(([entity]) => entity === UserPhotoEntity);

  it('a URL typed by hand still works and replaces the uploaded photo, deleted in the same transaction', async () => {
    const coach = makeUser(COACH_ID, Role.COACH, { avatarUrl: uploaded });
    const { manager, service } = setup(coach, 1);
    const dto = await service.update({ id: COACH_ID, data: { avatarUrl: 'https://cdn.example.com/leila.jpg' } });
    expect(dto.avatarUrl).toBe('https://cdn.example.com/leila.jpg');
    expect(photoDeletes(manager)).toEqual([[UserPhotoEntity, { userId: COACH_ID }]]);
    expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: 'https://cdn.example.com/leila.jpg' }));
  });

  it('null clears the photo as well', async () => {
    const { manager, service } = setup(makeUser(COACH_ID, Role.COACH, { avatarUrl: uploaded }), 1);
    expect((await service.update({ id: COACH_ID, data: { avatarUrl: null } })).avatarUrl).toBeNull();
    expect(photoDeletes(manager)).toHaveLength(1);
  });

  it('sending back the own photo URL (even an older version) or the same URL changes nothing', async () => {
    const coach = setup(makeUser(COACH_ID, Role.COACH, { avatarUrl: uploaded }), 1);
    const older = coachPhotoUrl(COACH_ID, new Date('2026-11-01T09:00:00.000Z'));
    const dto = await coach.service.update({ id: COACH_ID, data: { avatarUrl: older, bio: 'Yoga et mobilité' } });
    expect(dto).toMatchObject({ avatarUrl: uploaded, bio: 'Yoga et mobilité' });

    const typed = setup(makeUser(COACH_ID, Role.COACH, { avatarUrl: 'https://cdn.example.com/a.jpg' }), 1);
    await typed.service.update({ id: COACH_ID, data: { avatarUrl: 'https://cdn.example.com/a.jpg' } });
    await typed.service.update({ id: COACH_ID, data: { firstName: 'Leila' } });
    expect(photoDeletes(coach.manager)).toHaveLength(0);
    expect(photoDeletes(typed.manager)).toHaveLength(0);
  });

  it('a demotion keeps the photo (the public route stops serving it)', async () => {
    const { manager, service } = setup(makeUser(COACH_ID, Role.COACH, { avatarUrl: uploaded }), 1);
    expect((await service.update({ id: COACH_ID, data: { role: Role.STAFF } })).avatarUrl).toBe(uploaded);
    expect(photoDeletes(manager)).toHaveLength(0);
  });
});
