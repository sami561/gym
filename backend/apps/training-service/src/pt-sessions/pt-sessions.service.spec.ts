import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { PtSessionStatus } from '@app/common';
import { PeopleService } from '../shared/people.service';
import { PtSession } from './pt-session.entity';
import { PtSessionsService } from './pt-sessions.service';

function session(overrides: Partial<PtSession> = {}): PtSession {
  return Object.assign(new PtSession(), {
    id: 'pt-1',
    coachId: 'u-coach',
    coachName: 'Karim Jaziri',
    memberId: 'm-1',
    memberName: 'Amira Ben Salah',
    startsAt: new Date('2026-11-03T17:00:00.000Z'),
    endsAt: new Date('2026-11-03T18:00:00.000Z'),
    status: PtSessionStatus.SCHEDULED,
    price: 45,
    notes: null,
    ...overrides,
  });
}

/** Every createQueryBuilder() call gets its own chain: getExists answers whether the coach is busy. */
function setup({
  busy = false,
  stored = session(),
  summary = { sessions: '0', revenue: '0' },
}: { busy?: boolean; stored?: PtSession | null; summary?: { sessions: string; revenue: string } } = {}) {
  const builders: Record<string, jest.Mock>[] = [];
  const sessions = {
    createQueryBuilder: jest.fn(() => {
      const qb: Record<string, jest.Mock> = {};
      for (const method of ['select', 'addSelect', 'where', 'andWhere', 'orderBy']) qb[method] = jest.fn(() => qb);
      qb.getExists = jest.fn().mockResolvedValue(busy);
      qb.getRawOne = jest.fn().mockResolvedValue(summary);
      qb.getMany = jest.fn().mockResolvedValue([]);
      builders.push(qb);
      return qb;
    }),
    create: jest.fn((data: Partial<PtSession>) => Object.assign(new PtSession(), data)),
    save: jest.fn(async (row: PtSession) => Object.assign(row, { id: row.id ?? 'pt-new' })),
    findOne: jest.fn().mockResolvedValue(stored),
  };
  const people = {
    coachName: jest.fn().mockResolvedValue('Karim Jaziri'),
    memberName: jest.fn().mockResolvedValue('Amira Ben Salah'),
  };
  const service = new PtSessionsService(sessions as unknown as Repository<PtSession>, people as unknown as PeopleService);
  return { service, sessions, people, builders };
}

describe('PtSessionsService (personal training)', () => {
  const slot = { coachId: 'u-coach', memberId: 'm-1', startsAt: '2026-11-03T18:00:00+01:00', endsAt: '2026-11-03T19:00:00+01:00', price: 45 };

  describe('create', () => {
    it('books a scheduled session with the names resolved', async () => {
      const { service } = setup();
      expect(await service.create({ ...slot, notes: ' Reprise ' })).toEqual({
        id: 'pt-new',
        coachId: 'u-coach',
        coachName: 'Karim Jaziri',
        memberId: 'm-1',
        memberName: 'Amira Ben Salah',
        startsAt: '2026-11-03T17:00:00.000Z',
        endsAt: '2026-11-03T18:00:00.000Z',
        status: PtSessionStatus.SCHEDULED,
        price: 45,
        notes: 'Reprise',
      });
    });

    it('validates the slot: end after start, 6 hours at most', async () => {
      const { service } = setup();
      await expect(service.create({ ...slot, endsAt: slot.startsAt })).rejects.toThrow(
        new BadRequestException('La fin de la séance doit être après le début.'),
      );
      await expect(service.create({ ...slot, endsAt: '2026-11-04T00:01:00+01:00' })).rejects.toThrow(
        'Une séance ne peut pas dépasser 6 heures.',
      );
      await expect(service.create({ ...slot, startsAt: 'demain' })).rejects.toThrow('Début de séance : date invalide.');
      await expect(service.create({ ...slot, endsAt: '2026-11-04T00:00:00+01:00' })).resolves.toBeDefined();
    });

    it('needs a coach, a member and a positive price', async () => {
      const { service } = setup();
      await expect(service.create({ ...slot, coachId: ' ' })).rejects.toThrow('Le coach est obligatoire.');
      await expect(service.create({ ...slot, memberId: '' })).rejects.toThrow('Le membre est obligatoire.');
      await expect(service.create({ ...slot, price: -10 })).rejects.toThrow('Le prix doit être un montant positif.');
    });

    it('refuses a slot overlapping another scheduled or done session of the coach', async () => {
      const { service, builders, sessions } = setup({ busy: true });
      await expect(service.create(slot)).rejects.toThrow(new ConflictException('Le coach a déjà une séance sur ce créneau.'));
      expect(builders[0].andWhere).toHaveBeenCalledWith('s.status IN (:...statuses)', {
        statuses: [PtSessionStatus.SCHEDULED, PtSessionStatus.DONE],
      });
      expect(builders[0].andWhere).toHaveBeenCalledWith('s.startsAt < :endsAt AND s.endsAt > :startsAt', {
        startsAt: new Date('2026-11-03T17:00:00.000Z'),
        endsAt: new Date('2026-11-03T18:00:00.000Z'),
      });
      expect(sessions.save).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('re-checks the coach when a cancelled session is scheduled again', async () => {
      const { service, builders } = setup({ stored: session({ status: PtSessionStatus.CANCELLED }), busy: true });
      await expect(service.update({ id: 'pt-1', data: { status: PtSessionStatus.SCHEDULED } })).rejects.toThrow(
        'Le coach a déjà une séance sur ce créneau.',
      );
      expect(builders[0].andWhere).toHaveBeenCalledWith('s.id != :exceptId', { exceptId: 'pt-1' });
    });

    it('does not re-check when only the price or notes change, or when cancelling', async () => {
      const { service, sessions } = setup({ busy: true });
      expect(await service.update({ id: 'pt-1', data: { price: 50, notes: '' } })).toMatchObject({ price: 50, notes: null });
      expect(await service.update({ id: 'pt-1', data: { status: PtSessionStatus.CANCELLED } })).toMatchObject({
        status: PtSessionStatus.CANCELLED,
      });
      expect(sessions.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('moves the slot keeping the side not sent', async () => {
      const { service } = setup();
      expect(await service.update({ id: 'pt-1', data: { startsAt: '2026-11-03T17:30:00+01:00' } })).toMatchObject({
        startsAt: '2026-11-03T16:30:00.000Z',
        endsAt: '2026-11-03T18:00:00.000Z',
      });
    });

    it('refuses an unknown status and an unknown session', async () => {
      await expect(setup().service.update({ id: 'pt-1', data: { status: 'MOVED' as PtSessionStatus } })).rejects.toThrow('Statut invalide.');
      await expect(setup({ stored: null }).service.update({ id: 'pt-x', data: {} })).rejects.toThrow(
        new NotFoundException('Séance introuvable.'),
      );
    });
  });

  describe('coachSummary (feeds the payroll commissions)', () => {
    it('counts the DONE sessions of the gym month', async () => {
      const { service, builders } = setup({ summary: { sessions: '12', revenue: '540.000' } });
      expect(await service.coachSummary({ coachId: 'u-coach', period: '2026-10' })).toEqual({
        coachId: 'u-coach',
        period: '2026-10',
        sessions: 12,
        revenue: 540,
      });
      expect(builders[0].andWhere).toHaveBeenCalledWith('s.status = :status', { status: PtSessionStatus.DONE });
      expect(builders[0].andWhere).toHaveBeenCalledWith('s.startsAt >= :start AND s.startsAt < :end', {
        start: new Date(2026, 9, 1),
        end: new Date(2026, 10, 1),
      });
    });

    it('crosses the year for December and answers 0 without rows', async () => {
      const { service, builders } = setup({ summary: undefined as unknown as { sessions: string; revenue: string } });
      expect(await service.coachSummary({ coachId: 'u-coach', period: '2026-12' })).toMatchObject({ sessions: 0, revenue: 0 });
      expect(builders[0].andWhere).toHaveBeenCalledWith('s.startsAt >= :start AND s.startsAt < :end', {
        start: new Date(2026, 11, 1),
        end: new Date(2027, 0, 1),
      });
    });

    it('refuses a period that is not YYYY-MM', async () => {
      for (const period of ['2026-13', '2026-1', '', undefined]) {
        await expect(setup().service.coachSummary({ coachId: 'u-coach', period: period as string })).rejects.toThrow(
          new BadRequestException('La période doit être au format AAAA-MM.'),
        );
      }
    });
  });
});
