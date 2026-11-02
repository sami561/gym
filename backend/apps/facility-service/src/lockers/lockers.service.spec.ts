import { BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { FindOperator, Repository } from 'typeorm';
import { LockerStatus, PATTERNS, RpcClient, RpcError } from '@app/common';
import { RoomsService } from '../rooms/rooms.service';
import { Locker } from './locker.entity';
import { LockersService } from './lockers.service';

function locker(overrides: Partial<Locker> = {}): Locker {
  return Object.assign(new Locker(), {
    id: 'l-12',
    number: 'H-12',
    roomId: null,
    room: null,
    status: LockerStatus.FREE,
    memberId: null,
    memberName: null,
    assignedUntil: null,
    ...overrides,
  });
}

/** `findOne` answers the locker by id first, then whether the member already holds another one. */
function setup(stored: Locker | null, otherOfMember: Locker | null = null) {
  const lockers = {
    findOne: jest.fn().mockResolvedValueOnce(stored).mockResolvedValueOnce(otherOfMember),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn(async (rows: Locker | Locker[]) => rows),
    create: jest.fn((data: Partial<Locker>) => Object.assign(new Locker(), data)),
    update: jest.fn().mockResolvedValue({ affected: 2 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const rooms = { findOrFail: jest.fn() };
  const rpc = { send: jest.fn().mockResolvedValue({ firstName: 'Amira', lastName: 'Ben Salah' }) };
  const service = new LockersService(lockers as unknown as Repository<Locker>, rooms as unknown as RoomsService, rpc as unknown as RpcClient);
  return { service, lockers, rpc };
}

describe('LockersService (locker rentals)', () => {
  describe('assign', () => {
    it('rents a free locker, naming the member from membership-service', async () => {
      const { service, rpc } = setup(locker());
      expect(await service.assign({ id: 'l-12', memberId: 'm-1', assignedUntil: '2026-12-31' })).toMatchObject({
        status: LockerStatus.OCCUPIED,
        memberId: 'm-1',
        memberName: 'Amira Ben Salah',
        assignedUntil: '2026-12-31',
      });
      expect(rpc.send).toHaveBeenCalledWith(PATTERNS.members.get, { id: 'm-1' }, 3000);
    });

    it('still rents the locker, without a name, when membership-service is down', async () => {
      const { service, rpc } = setup(locker());
      rpc.send.mockRejectedValue(new RpcError(503, 'Service indisponible (members.get)'));
      expect(await service.assign({ id: 'l-12', memberId: 'm-1' })).toMatchObject({ memberId: 'm-1', memberName: null });
    });

    it('keeps the name and end date when the same member is re-assigned without them', async () => {
      const { service, rpc } = setup(locker({ status: LockerStatus.OCCUPIED, memberId: 'm-1', memberName: 'Amira B.', assignedUntil: '2026-12-31' }));
      expect(await service.assign({ id: 'l-12', memberId: 'm-1' })).toMatchObject({ memberName: 'Amira B.', assignedUntil: '2026-12-31' });
      expect(rpc.send).not.toHaveBeenCalled();
    });

    it('lets staff clear the end date or type the name', async () => {
      const { service } = setup(locker({ status: LockerStatus.OCCUPIED, memberId: 'm-1', memberName: 'Amira B.', assignedUntil: '2026-12-31' }));
      expect(await service.assign({ id: 'l-12', memberId: 'm-1', memberName: ' Amira Ben Salah ', assignedUntil: null })).toMatchObject({
        memberName: 'Amira Ben Salah',
        assignedUntil: null,
      });
    });

    it('refuses a locker out of order, held by someone else, or a second locker for the member', async () => {
      await expect(setup(locker({ status: LockerStatus.OUT_OF_ORDER })).service.assign({ id: 'l-12', memberId: 'm-1' })).rejects.toThrow(
        new ConflictException('Casier hors service.'),
      );
      await expect(
        setup(locker({ status: LockerStatus.OCCUPIED, memberId: 'm-2', memberName: 'Yassine T.' })).service.assign({ id: 'l-12', memberId: 'm-1' }),
      ).rejects.toThrow('Casier déjà attribué à Yassine T..');
      await expect(setup(locker(), locker({ id: 'l-3', number: 'H-3' })).service.assign({ id: 'l-12', memberId: 'm-1' })).rejects.toThrow(
        'Ce membre a déjà le casier H-3.',
      );
    });

    it('refuses an assignment with a FREE or OUT_OF_ORDER status and a bad end date', async () => {
      await expect(setup(locker()).service.assign({ id: 'l-12', memberId: 'm-1', status: LockerStatus.FREE })).rejects.toThrow(
        new BadRequestException('Un casier attribué est forcément occupé.'),
      );
      await expect(setup(locker()).service.assign({ id: 'l-12', memberId: 'm-1', status: 'BROKEN' as LockerStatus })).rejects.toThrow(
        'Statut invalide.',
      );
      await expect(setup(locker()).service.assign({ id: 'l-12', memberId: 'm-1', assignedUntil: '31/12/2026' })).rejects.toThrow(
        "Date de fin d'attribution : date invalide (AAAA-MM-JJ attendu).",
      );
    });

    it('releases a locker, or puts it out of order', async () => {
      const rented = () => locker({ status: LockerStatus.OCCUPIED, memberId: 'm-1', memberName: 'Amira', assignedUntil: '2026-12-31' });
      expect(await setup(rented()).service.assign({ id: 'l-12', memberId: null })).toMatchObject({
        status: LockerStatus.FREE,
        memberId: null,
        memberName: null,
        assignedUntil: null,
      });
      expect(
        await setup(rented()).service.assign({ id: 'l-12', memberId: null, status: LockerStatus.OUT_OF_ORDER }),
      ).toMatchObject({ status: LockerStatus.OUT_OF_ORDER, memberId: null });
    });

    it('answers 404 for an unknown locker', async () => {
      await expect(setup(null).service.assign({ id: 'l-x', memberId: 'm-1' })).rejects.toThrow(new NotFoundException('Casier introuvable.'));
    });
  });

  it('refuses to delete a rented locker', async () => {
    await expect(setup(locker({ memberId: 'm-1', memberName: 'Amira' })).service.remove({ id: 'l-12' })).rejects.toThrow(
      "Casier attribué à Amira : libérez-le d'abord.",
    );
  });

  it('creates only the missing numbers of a range, in natural order when listed', async () => {
    const { service, lockers } = setup(null);
    lockers.find.mockResolvedValueOnce([locker({ number: 'H-2' })]);
    const created = await service.create({ prefix: 'H-', from: 1, to: 3 });
    expect(created.map((l) => l.number)).toEqual(['H-1', 'H-3']);

    lockers.find.mockResolvedValueOnce([locker({ number: 'H-10' }), locker({ number: 'H-2' }), locker({ number: 'H-1' })]);
    expect((await service.list({})).map((l) => l.number)).toEqual(['H-1', 'H-2', 'H-10']);
  });

  it('frees the rentals whose last day has passed (gym calendar)', async () => {
    jest.useFakeTimers({ now: new Date(2026, 10, 2, 3, 0) });
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { service, lockers } = setup(null);
    await service.releaseExpired();
    const [where, changes] = lockers.update.mock.calls[0];
    expect((where.assignedUntil as FindOperator<string>).type).toBe('lessThan');
    expect((where.assignedUntil as FindOperator<string>).value).toBe('2026-11-02');
    expect(changes).toEqual({ status: LockerStatus.FREE, memberId: null, memberName: null, assignedUntil: null });
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
});
