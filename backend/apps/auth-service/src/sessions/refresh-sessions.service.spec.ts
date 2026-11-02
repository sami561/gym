import { Logger, UnauthorizedException } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { RefreshSession } from './refresh-session.entity';
import { RefreshSessionsService } from './refresh-sessions.service';

const USER = '5d0c3c38-61c6-4c55-8f3e-1f2f6d0a0b0c';
const FAMILY = '9a3a8d3e-2f1b-4f6e-a1c2-3b4c5d6e7f80';
const A = '0b1f0f7e-8a43-4c55-9d43-6a1c2a7f0001';
const B = '0b1f0f7e-8a43-4c55-9d43-6a1c2a7f0002';
const C = '0b1f0f7e-8a43-4c55-9d43-6a1c2a7f0003';

function family(patch: Partial<RefreshSession> = {}): RefreshSession {
  const now = Date.now();
  return Object.assign(new RefreshSession(), {
    id: FAMILY,
    userId: USER,
    currentJti: A,
    previousJti: null,
    rotatedAt: null,
    expiresAt: new Date(now + 86_400_000),
    revokedAt: null,
    createdAt: new Date(now - 3_600_000),
    lastUsedAt: new Date(now - 3_600_000),
    ...patch,
  });
}

describe('RefreshSessionsService', () => {
  const manager = {
    findOne: jest.fn(),
    save: jest.fn(async <T>(entity: T) => entity),
    create: jest.fn((_target: unknown, data: object) => Object.assign(new RefreshSession(), data)),
    update: jest.fn(),
  };
  const transaction = jest.fn(async (_isolation: string, work: (m: typeof manager) => unknown) => work(manager));
  const dataSource = { transaction, manager } as unknown as DataSource;
  const service = new RefreshSessionsService(dataSource);
  const claims = (jti: string) => ({ sub: USER, ver: 0, fam: FAMILY, jti });
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  it('reads the family under a row lock, scoped to the token owner, in READ COMMITTED', async () => {
    manager.findOne.mockResolvedValueOnce(family());
    await service.use(claims(A));
    expect(transaction).toHaveBeenCalledWith('READ COMMITTED', expect.any(Function));
    expect(manager.findOne).toHaveBeenCalledWith(RefreshSession, {
      where: { id: FAMILY, userId: USER },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('rotates the newest token', async () => {
    manager.findOne.mockResolvedValueOnce(family());
    const result = await service.use(claims(A));
    expect(result.previousJti).toBe(A);
    expect(result.currentJti).not.toBe(A);
    expect(result.rotatedAt).toBeInstanceOf(Date);
    expect(manager.save).toHaveBeenCalledWith(result);
  });

  it('hands the current jti out again to a request racing the rotation', async () => {
    manager.findOne.mockResolvedValueOnce(family({ currentJti: B, previousJti: A, rotatedAt: new Date(Date.now() - 5_000) }));
    const result = await service.use(claims(A));
    expect(result).toMatchObject({ currentJti: B, previousJti: A, revokedAt: null });
  });

  it('revokes the family on reuse, commits it, logs ids only and answers 401', async () => {
    manager.findOne.mockResolvedValueOnce(family({ currentJti: C, previousJti: B, rotatedAt: new Date(Date.now() - 600_000) }));
    await expect(service.use(claims(A))).rejects.toBeInstanceOf(UnauthorizedException);
    // The transaction callback resolved (the revocation is committed) before the 401 is thrown.
    await expect(transaction.mock.results[0].value).resolves.toMatchObject({ verdict: 'reuse' });
    expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ revokedAt: expect.any(Date) }));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(USER));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(FAMILY));
  });

  it('answers 401 without writing for an unknown or revoked family', async () => {
    manager.findOne.mockResolvedValueOnce(null);
    await expect(service.use(claims(A))).rejects.toBeInstanceOf(UnauthorizedException);
    manager.findOne.mockResolvedValueOnce(family({ revokedAt: new Date() }));
    await expect(service.use(claims(A))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(manager.save).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('opens a family with a fresh jti that expires with its tokens', async () => {
    const opened = await service.open(USER);
    expect(opened).toMatchObject({ userId: USER, previousJti: null, rotatedAt: null, revokedAt: null });
    expect(opened.currentJti).toMatch(/^[0-9a-f-]{36}$/);
    expect(opened.expiresAt.getTime()).toBeGreaterThan(Date.now() + 86_400_000);
  });

  it('revokes only the open families of the user', async () => {
    await service.revokeAll(USER, manager as never);
    expect(manager.update).toHaveBeenCalledWith(
      RefreshSession,
      { userId: USER, revokedAt: IsNull() },
      { revokedAt: expect.any(Date) },
    );
  });
});
