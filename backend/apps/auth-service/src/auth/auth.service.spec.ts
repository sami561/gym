import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { JwtPayload, Role } from '@app/common';
import { RefreshSession } from '../sessions/refresh-session.entity';
import { RefreshSessionsService } from '../sessions/refresh-sessions.service';
import { hashPassword, verifyPassword } from '../users/passwords';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

// Hermetic: backend/.env is not loaded; bcrypt is real, verifyPassword observable.
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('../users/passwords', () => {
  const actual = jest.requireActual('../users/passwords');
  return { ...actual, verifyPassword: jest.fn(actual.verifyPassword) };
});

const USER_ID = '5d0c3c38-61c6-4c55-8f3e-1f2f6d0a0b0c';
const FAMILY_ID = '9a3a8d3e-2f1b-4f6e-a1c2-3b4c5d6e7f80';
const NEW_FAMILY_ID = '9a3a8d3e-2f1b-4f6e-a1c2-3b4c5d6e7f81';
const JTI = '0b1f0f7e-8a43-4c55-9d43-6a1c2a7f0001';
const NEXT_JTI = '0b1f0f7e-8a43-4c55-9d43-6a1c2a7f0002';
const PASSWORD = 'Ancien-mot-de-passe';
const ENV: Record<string, string> = {
  JWT_ACCESS_SECRET: 'spec-access-secret-0123456789abcdef0123456789',
  JWT_REFRESH_SECRET: 'spec-refresh-secret-0123456789abcdef012345678',
  JWT_ACCESS_TTL_SECONDS: '900',
  JWT_REFRESH_TTL_DAYS: '30',
};

function makeUser(patch: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: USER_ID,
    email: 'membre@example.com',
    phone: null,
    passwordHash: '',
    role: Role.MEMBER,
    firstName: 'Membre',
    lastName: 'Test',
    avatarUrl: null,
    specialty: null,
    bio: null,
    isActive: true,
    tokenVersion: 2,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...patch,
  });
}

function makeFamily(id: string, currentJti: string): RefreshSession {
  return Object.assign(new RefreshSession(), {
    id,
    userId: USER_ID,
    currentJti,
    previousJti: null,
    rotatedAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    createdAt: new Date(),
    lastUsedAt: new Date(),
  });
}

function setup() {
  const users = { findByEmail: jest.fn(), findOrFail: jest.fn(), recordLogin: jest.fn() };
  const sessions = { open: jest.fn(), use: jest.fn(), revokeAll: jest.fn() };
  const manager = { findOne: jest.fn(), save: jest.fn(async <T>(entity: T) => entity), increment: jest.fn() };
  const dataSource = { transaction: jest.fn(async (work: (m: typeof manager) => unknown) => work(manager)) };
  const jwt = new JwtService({});
  const service = new AuthService(
    users as unknown as UsersService,
    sessions as unknown as RefreshSessionsService,
    jwt,
    dataSource as unknown as DataSource,
  );
  const decode = (token: string) => jwt.decode(token) as JwtPayload;
  const refreshToken = (claims: Partial<JwtPayload>, secret = ENV.JWT_REFRESH_SECRET) =>
    jwt.sign(
      { sub: USER_ID, role: Role.MEMBER, email: 'membre@example.com', name: 'Membre Test', type: 'refresh', ver: 2, ...claims },
      { secret, expiresIn: 3600 },
    );
  return { users, sessions, manager, dataSource, service, decode, refreshToken };
}

describe('AuthService', () => {
  const saved: Record<string, string | undefined> = {};
  let hash: string;

  beforeAll(async () => {
    for (const [name, value] of Object.entries(ENV)) {
      saved[name] = process.env[name];
      process.env[name] = value;
    }
    hash = await hashPassword(PASSWORD);
  });

  afterAll(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  beforeEach(() => (verifyPassword as jest.Mock).mockClear());

  describe('login', () => {
    it('runs bcrypt for an unknown e-mail and answers exactly like a wrong password', async () => {
      const { users, sessions, service } = setup();
      users.findByEmail.mockResolvedValueOnce(null);
      const unknown = service.login({ email: 'personne@example.com', password: PASSWORD });
      await expect(unknown).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(unknown).rejects.toThrow('E-mail ou mot de passe incorrect.');
      expect(verifyPassword).toHaveBeenCalledWith(PASSWORD, undefined);

      users.findByEmail.mockResolvedValueOnce(makeUser({ passwordHash: hash }));
      await expect(service.login({ email: 'membre@example.com', password: 'faux' })).rejects.toThrow(
        'E-mail ou mot de passe incorrect.',
      );
      expect(sessions.open).not.toHaveBeenCalled();
    });

    it('opens a login family and signs it into the refresh token only', async () => {
      const { users, sessions, service, decode } = setup();
      users.findByEmail.mockResolvedValueOnce(makeUser({ passwordHash: hash }));
      sessions.open.mockResolvedValueOnce(makeFamily(FAMILY_ID, JTI));
      const result = await service.login({ email: 'membre@example.com', password: PASSWORD });
      expect(sessions.open).toHaveBeenCalledWith(USER_ID);
      expect(decode(result.refreshToken)).toMatchObject({ sub: USER_ID, type: 'refresh', ver: 2, fam: FAMILY_ID, jti: JTI });
      expect(decode(result.accessToken)).toMatchObject({ sub: USER_ID, type: 'access' });
      expect(decode(result.accessToken).fam).toBeUndefined();
    });

    it('writes only lastLoginAt, never the row it read before bcrypt (no lost update)', async () => {
      const { users, sessions, service } = setup();
      users.findByEmail.mockResolvedValueOnce(makeUser({ passwordHash: hash }));
      sessions.open.mockResolvedValueOnce(makeFamily(FAMILY_ID, JTI));
      await service.login({ email: 'membre@example.com', password: PASSWORD });
      // The users mock has no save(): a whole-row write would fail this test.
      expect(users.recordLogin).toHaveBeenCalledWith(USER_ID, expect.any(Date));
    });

    it('still refuses a deactivated account with the right password', async () => {
      const { users, service } = setup();
      users.findByEmail.mockResolvedValueOnce(makeUser({ passwordHash: hash, isActive: false }));
      await expect(service.login({ email: 'membre@example.com', password: PASSWORD })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('refresh', () => {
    it('hands the claims to the family and signs its new jti', async () => {
      const { users, sessions, service, decode, refreshToken } = setup();
      users.findOrFail.mockResolvedValueOnce(makeUser());
      sessions.use.mockResolvedValueOnce(makeFamily(FAMILY_ID, NEXT_JTI));
      const result = await service.refresh({ refreshToken: refreshToken({ fam: FAMILY_ID, jti: JTI }) });
      expect(sessions.use).toHaveBeenCalledWith({ sub: USER_ID, ver: 2, fam: FAMILY_ID, jti: JTI });
      expect(decode(result.refreshToken)).toMatchObject({ ver: 2, fam: FAMILY_ID, jti: NEXT_JTI });
    });

    it('refuses once the tokens signed before rotation existed (no fam / jti)', async () => {
      const { users, sessions, service, refreshToken } = setup();
      await expect(service.refresh({ refreshToken: refreshToken({}) })).rejects.toThrow('Session expirée, reconnectez-vous.');
      expect(users.findOrFail).not.toHaveBeenCalled();
      expect(sessions.use).not.toHaveBeenCalled();
    });

    it('refuses a token of a previous version (logout, password change) without touching the family', async () => {
      const { users, sessions, service, refreshToken } = setup();
      users.findOrFail.mockResolvedValueOnce(makeUser({ tokenVersion: 3 }));
      await expect(service.refresh({ refreshToken: refreshToken({ fam: FAMILY_ID, jti: JTI }) })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(sessions.use).not.toHaveBeenCalled();
    });

    it('refuses tokens signed with another secret and garbage', async () => {
      const { service, refreshToken } = setup();
      const forged = refreshToken({ fam: FAMILY_ID, jti: JTI }, ENV.JWT_ACCESS_SECRET);
      await expect(service.refresh({ refreshToken: forged })).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(service.refresh({ refreshToken: 'pas-un-jwt' })).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('changePassword', () => {
    it('ends every session, then opens a fresh one for the caller', async () => {
      const { users, sessions, manager, service, decode } = setup();
      users.findOrFail.mockResolvedValueOnce(makeUser({ passwordHash: hash }));
      const locked = makeUser({ passwordHash: hash });
      manager.findOne.mockResolvedValueOnce(locked);
      sessions.open.mockResolvedValueOnce(makeFamily(NEW_FAMILY_ID, JTI));

      const result = await service.changePassword({
        userId: USER_ID,
        currentPassword: PASSWORD,
        newPassword: 'Nouveau-mot-de-passe',
      });

      expect(manager.findOne).toHaveBeenCalledWith(User, { where: { id: USER_ID }, lock: { mode: 'pessimistic_write' } });
      expect(locked.tokenVersion).toBe(3);
      await expect(bcrypt.compare('Nouveau-mot-de-passe', locked.passwordHash)).resolves.toBe(true);
      expect(sessions.revokeAll).toHaveBeenCalledWith(USER_ID, manager);
      expect(sessions.open).toHaveBeenCalledWith(USER_ID, manager);
      expect(sessions.revokeAll.mock.invocationCallOrder[0]).toBeLessThan(sessions.open.mock.invocationCallOrder[0]);
      expect(result.ok).toBe(true);
      expect(result.user.id).toBe(USER_ID);
      expect(decode(result.refreshToken)).toMatchObject({ type: 'refresh', ver: 3, fam: NEW_FAMILY_ID, jti: JTI });
      expect(decode(result.accessToken)).toMatchObject({ type: 'access', sub: USER_ID });
    });

    it('changes nothing when the current password is wrong', async () => {
      const { users, dataSource, service } = setup();
      users.findOrFail.mockResolvedValueOnce(makeUser({ passwordHash: hash }));
      await expect(
        service.changePassword({ userId: USER_ID, currentPassword: 'faux', newPassword: 'Nouveau-mot-de-passe' }),
      ).rejects.toThrow('Mot de passe actuel incorrect.');
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('re-checks the locked row: deactivated or password changed meanwhile → nothing written', async () => {
      const cases = [
        { locked: makeUser({ passwordHash: hash, isActive: false }), error: ForbiddenException },
        { locked: makeUser({ passwordHash: '$2b$10$autre-empreinte-posee-entre-temps' }), error: UnauthorizedException },
      ];
      for (const { locked, error } of cases) {
        const { users, sessions, manager, service } = setup();
        users.findOrFail.mockResolvedValueOnce(makeUser({ passwordHash: hash }));
        manager.findOne.mockResolvedValueOnce(locked);
        await expect(
          service.changePassword({ userId: USER_ID, currentPassword: PASSWORD, newPassword: 'Nouveau-mot-de-passe' }),
        ).rejects.toBeInstanceOf(error);
        expect(manager.save).not.toHaveBeenCalled();
        expect(sessions.revokeAll).not.toHaveBeenCalled();
        expect(sessions.open).not.toHaveBeenCalled();
        expect(locked.tokenVersion).toBe(2);
      }
    });

    it('does not hand a fresh session to a deactivated account', async () => {
      const { users, dataSource, service } = setup();
      users.findOrFail.mockResolvedValueOnce(makeUser({ passwordHash: hash, isActive: false }));
      await expect(
        service.changePassword({ userId: USER_ID, currentPassword: PASSWORD, newPassword: 'Nouveau-mot-de-passe' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  it('logout bumps the version and closes every family of the user', async () => {
    const { users, sessions, manager, service } = setup();
    users.findOrFail.mockResolvedValueOnce(makeUser());
    await expect(service.logout({ userId: USER_ID })).resolves.toEqual({ ok: true });
    expect(manager.increment).toHaveBeenCalledWith(User, { id: USER_ID }, 'tokenVersion', 1);
    expect(sessions.revokeAll).toHaveBeenCalledWith(USER_ID, manager);
  });
});
