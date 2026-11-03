import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource, EntityManager, FindOperator, Repository } from 'typeorm';
import { BookingStatus, EventBus, RpcClient } from '@app/common';
import { Booking } from '../bookings/booking.entity';
import { ClassSession } from './class-session.entity';
import { ClassesService } from './classes.service';
import { OccupancyService } from './occupancy.service';

// Now: Tuesday 3 Nov 2026, 11:00 in Tunis. Body Pump on Thursday 5 Nov, 18:00–19:00 (17:00–18:00 UTC).
const NOW = new Date('2026-11-03T10:00:00.000Z');
const SESSION_ID = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';

const session = (overrides: Partial<ClassSession> = {}): ClassSession =>
  Object.assign(new ClassSession(), {
    id: SESSION_ID,
    title: 'Body Pump',
    description: null,
    coachId: 'c-1',
    coachName: 'Karim Jaziri',
    room: 'Salle cours collectifs',
    color: '#7C3AED',
    startsAt: new Date('2026-11-05T17:00:00.000Z'),
    endsAt: new Date('2026-11-05T18:00:00.000Z'),
    capacity: 18,
    spotSelection: false,
    waitlistCapacity: 10,
    createdAt: new Date('2026-10-20T08:00:00.000Z'),
    ...overrides,
  });

type OverlapQuery = { where: Record<string, FindOperator<unknown>> };
type FindMock = jest.Mock<Promise<ClassSession[]>, [OverlapQuery]>;

function setup({ stored = session(), overlapping = [] as ClassSession[], checkedIn = 0 } = {}) {
  const locked = Object.assign(new ClassSession(), stored);
  const overlapRepo = { find: jest.fn<Promise<ClassSession[]>, [OverlapQuery]>().mockResolvedValue(overlapping) };
  const manager = {
    count: jest.fn().mockResolvedValue(checkedIn),
    getRepository: jest.fn(() => overlapRepo),
    save: jest.fn(async (row: ClassSession) => row),
    update: jest.fn().mockResolvedValue({ affected: 2 }),
    find: jest.fn().mockResolvedValue([]),
  };
  const sessions = {
    findOne: jest.fn().mockResolvedValue(Object.assign(new ClassSession(), stored)),
    find: jest.fn().mockResolvedValue(overlapping),
    create: jest.fn((data: Partial<ClassSession>) => Object.assign(new ClassSession(), data)),
    save: jest.fn(async (rows: ClassSession[]) => rows.map((row, i) => Object.assign(row, { id: `new-${i}` }))),
  };
  const dataSource = { transaction: jest.fn(async (work: (m: EntityManager) => unknown) => work(manager as unknown as EntityManager)) };
  const occupancy = {
    lockSession: jest.fn().mockResolvedValue(locked),
    loadOne: jest.fn().mockResolvedValue({ booked: 6, takenSpots: [], waitlist: [] }),
    promote: jest.fn().mockResolvedValue([]),
    publishPromoted: jest.fn(),
    load: jest.fn().mockResolvedValue(new Map()),
  };
  const rpc = { send: jest.fn() };
  const service = new ClassesService(
    sessions as unknown as Repository<ClassSession>,
    {} as Repository<Booking>,
    dataSource as unknown as DataSource,
    occupancy as unknown as OccupancyService,
    rpc as unknown as RpcClient,
    { publish: jest.fn() } as unknown as EventBus,
  );
  return { service, manager, sessions, overlapRepo, locked };
}

/** The `where` of the overlap query, operators reduced to their values. */
function overlapWhere(find: FindMock): Record<string, unknown> {
  const [[{ where }]] = find.mock.calls;
  return Object.fromEntries(Object.entries(where).map(([key, op]) => [key, `${op.type}:${String(op.value instanceof Date ? op.value.toISOString() : op.value)}`]));
}

describe('ClassesService moves (Africa/Tunis)', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  it('moves a booked session, checks the new slot against the other sessions and re-arms the reminders', async () => {
    const { service, manager, overlapRepo, locked } = setup();
    const dto = await service.update({
      id: SESSION_ID,
      data: { startsAt: '2026-11-06T19:30:00+01:00', endsAt: '2026-11-06T20:30:00+01:00' },
    });
    expect(dto).toMatchObject({ startsAt: '2026-11-06T18:30:00.000Z', endsAt: '2026-11-06T19:30:00.000Z' });
    expect(manager.save).toHaveBeenCalledWith(locked);
    expect(overlapWhere(overlapRepo.find)).toEqual({
      startsAt: 'lessThan:2026-11-06T19:30:00.000Z',
      endsAt: 'moreThan:2026-11-06T18:30:00.000Z',
      id: `not:${SESSION_ID}`,
    });
    expect(manager.update).toHaveBeenCalledWith(Booking, { sessionId: SESSION_ID, status: BookingStatus.BOOKED }, { reminderSentAt: null });
  });

  it('refuses a room already taken, and saves nothing', async () => {
    const yoga = session({ id: 's-yoga', title: 'Yoga', coachId: 'c-2', coachName: 'Leila Ayari', startsAt: new Date('2026-11-06T18:00:00.000Z'), endsAt: new Date('2026-11-06T19:00:00.000Z') });
    const { service, manager } = setup({ overlapping: [yoga] });
    await expect(
      service.update({ id: SESSION_ID, data: { startsAt: '2026-11-06T18:30:00.000Z', endsAt: '2026-11-06T19:30:00.000Z' } }),
    ).rejects.toThrow(new ConflictException('La salle « Salle cours collectifs » est déjà prise par « Yoga » le 06/11/2026 de 19:00 à 20:00.'));
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('refuses a session that already started and a start in the past', async () => {
    const running = setup({ stored: session({ startsAt: new Date('2026-11-03T09:30:00.000Z'), endsAt: new Date('2026-11-03T10:30:00.000Z') }) });
    await expect(
      running.service.update({ id: SESSION_ID, data: { startsAt: '2026-11-04T09:30:00.000Z', endsAt: '2026-11-04T10:30:00.000Z' } }),
    ).rejects.toThrow(new BadRequestException('Cette séance a déjà commencé : elle ne peut plus être déplacée.'));
    expect(running.manager.save).not.toHaveBeenCalled();

    const future = setup();
    await expect(
      future.service.update({ id: SESSION_ID, data: { startsAt: '2026-11-03T08:00:00.000Z', endsAt: '2026-11-03T09:00:00.000Z' } }),
    ).rejects.toThrow('Impossible de déplacer une séance dans le passé.');
    expect(future.manager.save).not.toHaveBeenCalled();
  });

  it('refuses to move a session once members are checked in', async () => {
    const { service, manager } = setup({ checkedIn: 2 });
    await expect(
      service.update({ id: SESSION_ID, data: { startsAt: '2026-11-06T18:30:00.000Z', endsAt: '2026-11-06T19:30:00.000Z' } }),
    ).rejects.toThrow('Des membres sont déjà pointés pour cette séance : elle ne peut plus être déplacée.');
    expect(manager.count).toHaveBeenCalledWith(Booking, { where: { sessionId: SESSION_ID, status: BookingStatus.ATTENDED } });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('lengthens a session without re-arming the reminders (the start did not move)', async () => {
    const { service, manager, overlapRepo } = setup();
    const dto = await service.update({ id: SESSION_ID, data: { endsAt: '2026-11-05T18:30:00.000Z' } });
    expect(dto.endsAt).toBe('2026-11-05T18:30:00.000Z');
    expect(overlapRepo.find).toHaveBeenCalledTimes(1);
    expect(manager.count).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('keeps editing a past session from the form: same minute, no move, no slot check', async () => {
    const past = session({ startsAt: new Date('2026-11-02T17:00:20.000Z'), endsAt: new Date('2026-11-02T18:00:00.000Z') });
    const { service, manager, overlapRepo, locked } = setup({ stored: past });
    const dto = await service.update({
      id: SESSION_ID,
      data: { title: 'Body Pump (remplacement)', startsAt: '2026-11-02T17:00:00.000Z', endsAt: '2026-11-02T18:00:00.000Z', room: 'Salle cours collectifs' },
    });
    expect(dto.title).toBe('Body Pump (remplacement)');
    expect(locked.startsAt.toISOString()).toBe('2026-11-02T17:00:20.000Z');
    expect(overlapRepo.find).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('checks a new room or coach even when the time stays', async () => {
    const hiit = session({ id: 's-hiit', title: 'HIIT Express', room: 'Zone cross-training', coachId: 'c-3', coachName: 'Sami Trabelsi' });
    const { service } = setup({ overlapping: [hiit] });
    await expect(service.update({ id: SESSION_ID, data: { room: 'Zone Cross-Training' } })).rejects.toThrow(
      'La salle « Zone cross-training » est déjà prise par « HIIT Express » le 05/11/2026 de 18:00 à 19:00.',
    );
  });
});

describe('ClassesService create (conflicts)', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  it('checks every repeated week before saving anything', async () => {
    const cycling = session({ id: 's-cyc', title: 'Cycling', coachId: 'c-9', coachName: 'Nour Hamdi', startsAt: new Date('2026-11-12T17:30:00.000Z'), endsAt: new Date('2026-11-12T18:15:00.000Z') });
    const { service, sessions } = setup();
    sessions.find.mockResolvedValueOnce([]).mockResolvedValueOnce([cycling]);
    await expect(
      service.create({
        title: 'Body Pump',
        room: 'Salle cours collectifs',
        startsAt: '2026-11-05T17:00:00.000Z',
        endsAt: '2026-11-05T18:00:00.000Z',
        repeatWeeks: 2,
      }),
    ).rejects.toThrow(new ConflictException('La salle « Salle cours collectifs » est déjà prise par « Cycling » le 12/11/2026 de 18:30 à 19:15.'));
    expect(sessions.save).not.toHaveBeenCalled();
  });

  it('creates sessions without room or coach without looking for conflicts', async () => {
    const { service, sessions } = setup();
    const created = await service.create({ title: 'Open gym', startsAt: '2026-11-05T17:00:00.000Z', endsAt: '2026-11-05T18:00:00.000Z' });
    expect(created).toHaveLength(1);
    expect(sessions.find).not.toHaveBeenCalled();
  });
});
