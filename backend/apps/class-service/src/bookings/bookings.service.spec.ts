import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { BookingStatus, EVENTS, EventBus, MemberStatus, RpcClient, RpcError } from '@app/common';
import { ClassSession } from '../classes/class-session.entity';
import { ClassesService } from '../classes/classes.service';
import { Occupancy } from '../classes/occupancy';
import { OccupancyService } from '../classes/occupancy.service';
import { Booking } from './booking.entity';
import { BookingsService } from './bookings.service';

const BOOKING_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
// Body Pump on 3 Nov 2026 at 18:00 in Tunis (17:00 UTC); cancellation deadline 2 h before.
const STARTS_AT = new Date('2026-11-03T17:00:00.000Z');
const POLICY_KEYS = ['BOOKING_OPENS_DAYS', 'BOOKING_CLOSES_MINUTES', 'CANCEL_DEADLINE_HOURS', 'NO_SHOW_LIMIT', 'NO_SHOW_BLOCK_DAYS', 'CHECKIN_WINDOW_MINUTES'];

const session = (overrides: Partial<ClassSession> = {}): ClassSession =>
  Object.assign(new ClassSession(), {
    id: 's-1',
    title: 'Body Pump',
    description: null,
    coachId: null,
    coachName: 'Karim Jaziri',
    room: null,
    color: null,
    startsAt: STARTS_AT,
    endsAt: new Date('2026-11-03T18:00:00.000Z'),
    capacity: 20,
    spotSelection: false,
    waitlistCapacity: 10,
    ...overrides,
  });

const booking = (status: BookingStatus, overrides: Partial<Booking> = {}): Booking =>
  Object.assign(new Booking(), {
    id: BOOKING_ID,
    sessionId: 's-1',
    memberId: 'm-1',
    memberName: 'Amira Ben Salah',
    memberEmail: 'amira@example.com',
    status,
    spotNumber: null,
    queuedAt: null,
    checkedInAt: null,
    reminderSentAt: null,
    strikeAt: null,
    createdAt: new Date('2026-10-30T08:00:00.000Z'),
    ...overrides,
  });

function setup({
  row = booking(BookingStatus.BOOKED),
  locked = session(),
  occupancy = { booked: 5, takenSpots: [], waitlist: [] },
  existing = null,
  strikes = [],
}: { row?: Booking; locked?: ClassSession; occupancy?: Occupancy; existing?: Booking | null; strikes?: Date[] } = {}) {
  const manager = {
    findOneOrFail: jest.fn().mockResolvedValue(row),
    findOne: jest.fn().mockResolvedValue(existing),
    create: jest.fn((_entity: unknown, data: Partial<Booking>) => Object.assign(new Booking(), data)),
    save: jest.fn(async (saved: Booking) => Object.assign(saved, { id: saved.id ?? 'b-new', createdAt: saved.createdAt ?? new Date() })),
  };
  const bookings = {
    findOne: jest.fn().mockResolvedValue(Object.assign(new Booking(), row, { session: locked })),
    find: jest.fn().mockResolvedValue(strikes.map((strikeAt) => ({ id: 'x', strikeAt }))),
  };
  const dataSource = { transaction: jest.fn(async (work: (m: EntityManager) => unknown) => work(manager as unknown as EntityManager)) };
  const classes = { findSession: jest.fn().mockResolvedValue(locked) };
  const occupancyService = {
    lockSession: jest.fn().mockResolvedValue(locked),
    promote: jest.fn().mockResolvedValue([]),
    loadOne: jest.fn().mockResolvedValue(occupancy),
    publishPromoted: jest.fn(),
  };
  const rpc = {
    send: jest.fn().mockResolvedValue({
      member: { id: 'm-1', firstName: 'Amira', lastName: 'Ben Salah', email: 'amira@example.com', status: MemberStatus.ACTIVE },
      membership: { active: true },
    }),
  };
  const events = { publish: jest.fn() };
  const service = new BookingsService(
    bookings as unknown as Repository<Booking>,
    dataSource as unknown as DataSource,
    classes as unknown as ClassesService,
    occupancyService as unknown as OccupancyService,
    rpc as unknown as RpcClient,
    events as unknown as EventBus,
  );
  return { service, manager, occupancyService, rpc, events, row };
}

describe('BookingsService (class bookings, Africa/Tunis)', () => {
  const saved: Record<string, string | undefined> = {};
  beforeAll(() => POLICY_KEYS.forEach((key) => (saved[key] = process.env[key])));
  beforeEach(() => POLICY_KEYS.forEach((key) => delete process.env[key])); // documented defaults
  afterEach(() => jest.useRealTimers());
  afterAll(() => POLICY_KEYS.forEach((key) => (saved[key] === undefined ? delete process.env[key] : (process.env[key] = saved[key]))));

  const at = (iso: string) => jest.useFakeTimers({ now: new Date(iso) });

  describe('cancel', () => {
    it('cancels freely before the deadline and frees the place for the waitlist', async () => {
      at('2026-11-03T14:59:00.000Z'); // 15:59 in Tunis
      const { service, occupancyService, events, row } = setup();
      const dto = await service.cancel({ bookingId: BOOKING_ID, memberId: 'm-1' });
      expect(row).toMatchObject({ status: BookingStatus.CANCELLED, strikeAt: null });
      expect(dto.status).toBe(BookingStatus.CANCELLED);
      expect(occupancyService.promote).toHaveBeenCalled();
      expect(events.publish).toHaveBeenCalledWith(EVENTS.bookingCancelled, expect.objectContaining({ bookingId: BOOKING_ID, status: BookingStatus.CANCELLED }));
    });

    it('records a late cancellation (a strike) from the deadline on', async () => {
      at('2026-11-03T15:00:00.000Z');
      const { service, row } = setup();
      await service.cancel({ bookingId: BOOKING_ID, memberId: 'm-1' });
      expect(row).toMatchObject({ status: BookingStatus.LATE_CANCELLED, strikeAt: new Date('2026-11-03T15:00:00.000Z') });
    });

    it('never gives a strike for leaving the waitlist or when staff cancels', async () => {
      at('2026-11-03T16:30:00.000Z');
      const waitlisted = setup({ row: booking(BookingStatus.WAITLISTED, { queuedAt: new Date('2026-11-02T10:00:00.000Z') }) });
      await waitlisted.service.cancel({ bookingId: BOOKING_ID, memberId: 'm-1' });
      expect(waitlisted.row).toMatchObject({ status: BookingStatus.CANCELLED, strikeAt: null, queuedAt: null });
      expect(waitlisted.occupancyService.promote).not.toHaveBeenCalled();

      const byStaff = setup();
      await byStaff.service.cancel({ bookingId: BOOKING_ID });
      expect(byStaff.row).toMatchObject({ status: BookingStatus.CANCELLED, strikeAt: null });
    });

    it('refuses to cancel a class that started, an attendance or a no-show', async () => {
      at('2026-11-03T17:00:00.000Z');
      await expect(setup().service.cancel({ bookingId: BOOKING_ID, memberId: 'm-1' })).rejects.toThrow(
        new BadRequestException("Impossible d'annuler une séance déjà commencée."),
      );
      await expect(setup({ row: booking(BookingStatus.ATTENDED) }).service.cancel({ bookingId: BOOKING_ID, memberId: 'm-1' })).rejects.toThrow(
        'Présence déjà enregistrée pour cette séance.',
      );
      await expect(setup({ row: booking(BookingStatus.NO_SHOW) }).service.cancel({ bookingId: BOOKING_ID, memberId: 'm-1' })).rejects.toThrow(
        'Séance terminée : absence déjà enregistrée.',
      );
    });

    it("refuses someone else's booking and malformed ids", async () => {
      at('2026-11-03T10:00:00.000Z');
      await expect(setup().service.cancel({ bookingId: BOOKING_ID, memberId: 'm-2' })).rejects.toThrow(
        new ForbiddenException('Cette réservation ne vous appartient pas.'),
      );
      await expect(setup().service.cancel({ bookingId: 'b-1', memberId: 'm-1' })).rejects.toThrow(new NotFoundException('Réservation introuvable.'));
    });

    it('changes nothing for a booking already cancelled', async () => {
      at('2026-11-03T10:00:00.000Z');
      const { service, events, manager } = setup({ row: booking(BookingStatus.LATE_CANCELLED, { strikeAt: new Date('2026-11-03T09:00:00.000Z') }) });
      expect((await service.cancel({ bookingId: BOOKING_ID, memberId: 'm-1' })).status).toBe(BookingStatus.LATE_CANCELLED);
      expect(manager.save).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });
  });

  describe('setStatus (staff and coaches)', () => {
    it('refuses NO_SHOW before the class starts and statuses owned by the booking flow', async () => {
      at('2026-11-03T16:59:00.000Z');
      await expect(setup().service.setStatus({ bookingId: BOOKING_ID, status: BookingStatus.NO_SHOW })).rejects.toThrow(
        'Impossible de marquer absent avant le début du cours.',
      );
      await expect(setup().service.setStatus({ bookingId: BOOKING_ID, status: BookingStatus.WAITLISTED })).rejects.toThrow(
        "La liste d'attente est gérée automatiquement par les réservations.",
      );
    });

    it('marks a no-show as a strike, keeping the date of an earlier strike', async () => {
      at('2026-11-03T18:30:00.000Z');
      const fresh = setup();
      await fresh.service.setStatus({ bookingId: BOOKING_ID, status: BookingStatus.NO_SHOW });
      expect(fresh.row).toMatchObject({ status: BookingStatus.NO_SHOW, strikeAt: new Date('2026-11-03T18:30:00.000Z') });

      const earlier = new Date('2026-11-03T15:30:00.000Z');
      const late = setup({ row: booking(BookingStatus.LATE_CANCELLED, { strikeAt: earlier }) });
      await late.service.setStatus({ bookingId: BOOKING_ID, status: BookingStatus.NO_SHOW });
      expect(late.row.strikeAt).toEqual(earlier);
    });

    it('re-books only into a free place, but always accepts a walk-in as attended', async () => {
      at('2026-11-03T17:10:00.000Z');
      const full = { booked: 20, takenSpots: [], waitlist: [] };
      await expect(
        setup({ row: booking(BookingStatus.CANCELLED), occupancy: full }).service.setStatus({ bookingId: BOOKING_ID, status: BookingStatus.BOOKED }),
      ).rejects.toThrow(new ConflictException('Séance complète.'));

      const walkIn = setup({ row: booking(BookingStatus.CANCELLED), occupancy: full });
      await walkIn.service.setStatus({ bookingId: BOOKING_ID, status: BookingStatus.ATTENDED });
      expect(walkIn.row).toMatchObject({ status: BookingStatus.ATTENDED, checkedInAt: new Date('2026-11-03T17:10:00.000Z'), strikeAt: null });
    });

    it('gives the first free spot when the old one was taken meanwhile', async () => {
      at('2026-11-03T12:00:00.000Z');
      const { service, row } = setup({
        locked: session({ spotSelection: true, capacity: 6 }),
        row: booking(BookingStatus.CANCELLED, { spotNumber: 2 }),
        occupancy: { booked: 3, takenSpots: [1, 2, 4], waitlist: [] },
      });
      await service.setStatus({ bookingId: BOOKING_ID, status: BookingStatus.BOOKED });
      expect(row).toMatchObject({ status: BookingStatus.BOOKED, spotNumber: 3 });
    });

    it('announces a staff cancellation and promotes the waitlist', async () => {
      at('2026-11-03T12:00:00.000Z');
      const { service, events, occupancyService } = setup();
      await service.setStatus({ bookingId: BOOKING_ID, status: BookingStatus.CANCELLED });
      expect(occupancyService.promote).toHaveBeenCalled();
      expect(events.publish).toHaveBeenCalledWith(EVENTS.bookingCancelled, expect.objectContaining({ status: BookingStatus.CANCELLED }));
    });
  });

  describe('create', () => {
    it('blocks a member with too many strikes until the end of the block', async () => {
      at('2026-11-02T10:00:00.000Z');
      const strikes = ['2026-10-20T17:00:00.000Z', '2026-10-27T17:00:00.000Z', '2026-10-30T17:00:00.000Z'].map((iso) => new Date(iso));
      await expect(setup({ strikes }).service.create({ sessionId: 's-1', memberId: 'm-1' })).rejects.toThrow(
        new ForbiddenException("Réservations suspendues jusqu'au 06/11/2026 à 18:00 (trop d'absences ou d'annulations tardives)."),
      );
    });

    it('requires an active membership and explains when membership-service is down', async () => {
      at('2026-11-02T10:00:00.000Z');
      const inactive = setup();
      inactive.rpc.send.mockResolvedValue({ member: { status: MemberStatus.ACTIVE }, membership: { active: false } });
      await expect(inactive.service.create({ sessionId: 's-1', memberId: 'm-1' })).rejects.toThrow(
        'Abonnement inactif : renouvelez votre abonnement pour réserver.',
      );
      const down = setup();
      down.rpc.send.mockRejectedValue(new RpcError(503, 'Service indisponible (members.profile)'));
      await expect(down.service.create({ sessionId: 's-1', memberId: 'm-1' })).rejects.toThrow(
        new ServiceUnavailableException('Service des abonnements indisponible, réessayez dans un instant.'),
      );
      const unknown = setup();
      unknown.rpc.send.mockRejectedValue(new RpcError(404, 'Membre introuvable.'));
      await expect(unknown.service.create({ sessionId: 's-1', memberId: 'm-1' })).rejects.toThrow(new NotFoundException('Membre introuvable.'));
      await expect(setup().service.create({ sessionId: 's-1', memberId: '' })).rejects.toThrow('Membre manquant.');
    });

    it('refuses a second booking or queue entry for the same class', async () => {
      at('2026-11-02T10:00:00.000Z');
      await expect(setup({ existing: booking(BookingStatus.BOOKED) }).service.create({ sessionId: 's-1', memberId: 'm-1' })).rejects.toThrow(
        new ConflictException('Vous avez déjà réservé cette séance.'),
      );
      await expect(setup({ existing: booking(BookingStatus.WAITLISTED) }).service.create({ sessionId: 's-1', memberId: 'm-1' })).rejects.toThrow(
        "Vous êtes déjà sur la liste d'attente de cette séance.",
      );
    });

    it('reuses a cancelled booking, clearing its strike, and queues when the class is full', async () => {
      at('2026-11-02T10:00:00.000Z');
      const previous = booking(BookingStatus.LATE_CANCELLED, { strikeAt: new Date('2026-10-01T10:00:00.000Z') });
      const rebook = setup({ existing: previous });
      const dto = await rebook.service.create({ sessionId: 's-1', memberId: 'm-1' });
      expect(previous).toMatchObject({ status: BookingStatus.BOOKED, strikeAt: null, queuedAt: null, memberName: 'Amira Ben Salah' });
      expect(dto.status).toBe(BookingStatus.BOOKED);
      expect(rebook.events.publish).toHaveBeenCalledWith(EVENTS.bookingCreated, expect.objectContaining({ status: BookingStatus.BOOKED }));

      const full = setup({ occupancy: { booked: 20, takenSpots: [], waitlist: [] } });
      await full.service.create({ sessionId: 's-1', memberId: 'm-1' });
      const queued = full.manager.save.mock.calls[0][0];
      expect(queued).toMatchObject({ status: BookingStatus.WAITLISTED, queuedAt: new Date('2026-11-02T10:00:00.000Z') });
    });
  });
});
