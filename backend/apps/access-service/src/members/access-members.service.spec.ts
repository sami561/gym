import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Entitlement, MemberStatus, PATTERNS, Role, RpcClient, RpcError } from '@app/common';
import { AccessMember } from './access-member.entity';
import { AccessMembersService } from './access-members.service';

const SECRET = 'a'.repeat(64);

function accessMember(overrides: Partial<AccessMember> = {}): AccessMember {
  return Object.assign(new AccessMember(), {
    memberId: 'm-1',
    memberCode: 'MEL-00042',
    firstName: 'Amira',
    lastName: 'Ben Salah',
    status: MemberStatus.ACTIVE,
    windows: [{ from: '2026-10-10', until: '2026-11-08' }],
    accessSecret: SECRET,
    cardNumber: null,
    deviceUid: 7,
    lastQrStep: null,
    ...overrides,
  });
}

const entitlement = (memberId: string): Entitlement => ({
  memberId,
  memberCode: `MEL-${memberId}`,
  firstName: 'Amira',
  lastName: 'Ben Salah',
  status: MemberStatus.ACTIVE,
  windows: [{ from: '2026-10-10', until: '2026-11-08' }],
});

function setup(found: AccessMember | null = accessMember()) {
  const repo = {
    query: jest.fn().mockResolvedValue([[], 0]),
    findOne: jest.fn().mockResolvedValue(found),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    save: jest.fn(async (row: AccessMember) => row),
  };
  const rpc = { send: jest.fn() };
  const service = new AccessMembersService(repo as unknown as Repository<AccessMember>, rpc as unknown as RpcClient);
  const sql = (index: number) => ({ text: repo.query.mock.calls[index][0] as string, params: repo.query.mock.calls[index][1] as unknown[] });
  return { service, repo, rpc, sql };
}

describe('AccessMembersService (door read model and credentials)', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  describe('finders', () => {
    it('never queries without a member id and skips deleted members', async () => {
      const { service, repo } = setup();
      expect(await service.findById(undefined)).toBeNull();
      expect(await service.findById(42 as unknown as string)).toBeNull();
      expect(repo.findOne).not.toHaveBeenCalled();
      await service.findById('m-1');
      expect(repo.findOne.mock.calls[0][0].where).toMatchObject({ memberId: 'm-1' });
      expect(repo.findOne.mock.calls[0][0].where.removedAt).toBeDefined();
    });
  });

  describe('event upserts (idempotent, out of order safe)', () => {
    it('updates the profile but keeps the windows, the secret and deleted rows deleted', async () => {
      const { service, sql } = setup();
      await service.upsertProfile({
        memberId: 'm-1',
        memberCode: 'MEL-00042',
        firstName: 'Amira',
        lastName: 'Ben Salah',
        email: 'amira@example.com',
        phone: null,
        status: MemberStatus.SUSPENDED,
      });
      const { text, params } = sql(0);
      expect(params.slice(0, 6)).toEqual(['m-1', 'MEL-00042', 'Amira', 'Ben Salah', MemberStatus.SUSPENDED, '[]']);
      expect(params[6]).toMatch(/^[0-9a-f]{64}$/); // secret used only if the row is new
      expect(text).toContain('ON CONFLICT ("memberId") DO UPDATE');
      expect(text).not.toContain('"windows" = EXCLUDED."windows"');
      expect(text).not.toMatch(/"accessSecret"\s*=/);
      expect(text).toContain('WHERE access_members."removedAt" IS NULL');
    });

    it('replaces the windows on an entitlement change, an invalid list counting as none', async () => {
      const { service, sql } = setup();
      await service.upsertEntitlement(entitlement('m-1'));
      expect(sql(0).params[5]).toBe(JSON.stringify([{ from: '2026-10-10', until: '2026-11-08' }]));
      expect(sql(0).text).toContain('"windows" = EXCLUDED."windows"');
      await service.upsertEntitlement({ ...entitlement('m-1'), windows: null as unknown as Entitlement['windows'] });
      expect(sql(1).params[5]).toBe('[]');
    });
  });

  describe('reconcile (full resync every 10 minutes)', () => {
    it('upserts what membership-service lists, revives listed tombstones and tombstones the rest', async () => {
      const { service, rpc, repo, sql } = setup();
      rpc.send.mockResolvedValue([entitlement('m-1'), entitlement('m-2')]);
      repo.query.mockResolvedValueOnce([[], 1]).mockResolvedValueOnce([[], 1]).mockResolvedValueOnce([[], 3]);

      expect(await service.reconcile()).toEqual({ upserted: 2, removed: 3 });

      expect(rpc.send).toHaveBeenCalledWith(PATTERNS.members.entitlements, {}, 15_000);
      const upsert = sql(0);
      expect(upsert.text).toContain('"removedAt" = NULL');
      expect(upsert.text).toContain('WHERE access_members."syncedAt" < $8');
      const startedAt = upsert.params[7] as Date;
      expect(startedAt).toBeInstanceOf(Date);
      const tombstone = sql(2);
      expect(tombstone.text).toContain('"firstName" = \'Membre\'');
      expect(tombstone.params).toEqual([startedAt, ['m-1', 'm-2']]);
    });

    it('skips the run while membership-service is down and warns once', async () => {
      const { service, rpc, repo } = setup();
      rpc.send.mockRejectedValue(new RpcError(503, 'Service indisponible (members.entitlements)'));
      expect(await service.reconcile()).toBeNull();
      expect(await service.reconcile()).toBeNull();
      expect(repo.query).not.toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
    });

    it('does not overlap two runs', async () => {
      const { service, rpc } = setup();
      let answer!: (value: Entitlement[]) => void;
      rpc.send.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
      const first = service.reconcile();
      expect(await service.reconcile()).toBeNull();
      answer([]);
      expect(await first).toEqual({ upserted: 0, removed: 0 });
    });
  });

  describe('QR credentials', () => {
    it('gives the member the key the app builds codes with', async () => {
      expect(await setup().service.accessKey('m-1')).toEqual({
        memberCode: 'MEL-00042',
        secret: SECRET,
        period: 30,
        format: 'MLR1.{memberCode}.{step}.{sig}',
      });
    });

    it('asks to retry while the member is not synced yet', async () => {
      await expect(setup(null).service.accessKey('m-1')).rejects.toThrow(
        new NotFoundException('Accès pas encore configuré, réessayez dans un instant.'),
      );
    });

    it('rotates the secret and resets the anti-replay step, without logging the secret', async () => {
      const { service, repo } = setup();
      const rotation = await service.rotateAccessKey({ memberId: 'm-1', actor: { id: 'u-admin', role: Role.ADMIN, name: 'Admin' } });
      expect(rotation.key.secret).toMatch(/^[0-9a-f]{64}$/);
      expect(rotation.key.secret).not.toBe(SECRET);
      expect(repo.update).toHaveBeenCalledWith({ memberId: 'm-1' }, { accessSecret: rotation.key.secret, lastQrStep: null });
      const logged = (Logger.prototype.log as jest.Mock).mock.calls.map(([line]) => String(line)).join('\n');
      expect(logged).toContain('MEL-00042');
      expect(logged).not.toContain(rotation.key.secret);
    });

    it('accepts a QR step once, with the secret it was checked with', async () => {
      const { service, repo } = setup();
      repo.query.mockResolvedValueOnce([[], 1]).mockResolvedValueOnce([[], 0]);
      expect(await service.consumeQrStep('m-1', 59_787_000, SECRET)).toBe(true);
      expect(await service.consumeQrStep('m-1', 59_787_000, SECRET)).toBe(false);
      expect(repo.query.mock.calls[0][1]).toEqual(['m-1', 59_787_000, SECRET]);
    });
  });

  describe('setCard (RFID badge)', () => {
    it('assigns a trimmed badge number, or removes it', async () => {
      const { service, repo } = setup();
      repo.findOne.mockResolvedValueOnce(accessMember()).mockResolvedValueOnce(null);
      expect((await service.setCard({ memberId: 'm-1', cardNumber: ' 0012345678 ' })).cardNumber).toBe('0012345678');
      repo.findOne.mockResolvedValueOnce(accessMember({ cardNumber: '0012345678' }));
      expect((await service.setCard({ memberId: 'm-1', cardNumber: '  ' })).cardNumber).toBeNull();
    });

    it('refuses invalid numbers and a badge held by someone else', async () => {
      const invalid = setup();
      await expect(invalid.service.setCard({ memberId: 'm-1', cardNumber: '00-12' })).rejects.toThrow(
        new ConflictException('Numéro de badge invalide (chiffres et lettres uniquement).'),
      );
      const taken = setup();
      taken.repo.findOne.mockResolvedValueOnce(accessMember()).mockResolvedValueOnce(accessMember({ memberId: 'm-2' }));
      await expect(taken.service.setCard({ memberId: 'm-1', cardNumber: '0012345678' })).rejects.toThrow(
        'Ce badge est déjà attribué à un autre membre.',
      );
      const same = setup();
      same.repo.findOne.mockResolvedValueOnce(accessMember()).mockResolvedValueOnce(accessMember());
      await expect(same.service.setCard({ memberId: 'm-1', cardNumber: '0012345678' })).resolves.toBeDefined();
    });

    it('answers 404 for an unknown member', async () => {
      await expect(setup(null).service.setCard({ memberId: 'm-x', cardNumber: '1' })).rejects.toThrow(
        new NotFoundException('Membre introuvable.'),
      );
    });
  });
});
