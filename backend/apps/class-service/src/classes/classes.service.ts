import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, LessThan, MoreThan, Not, Repository } from 'typeorm';
import {
  BookingDto,
  BookingStatus,
  ClassSessionDto,
  ClassStats,
  ClassStatsRequest,
  CreateClassRequest,
  EVENTS,
  EventBus,
  IdRequest,
  ListClassesRequest,
  OkResult,
  PATTERNS,
  Role,
  RpcClient,
  RpcError,
  UpdateClassRequest,
  UserDto,
  fullName,
} from '@app/common';
import { Booking } from '../bookings/booking.entity';
import { toBookingDto, toBookingEvent, toSessionDto } from '../mappers';
import { loadBookingPolicy } from './booking-policy';
import { ClassSession } from './class-session.entity';
import {
  DAY_MS,
  DEFAULT_CAPACITY,
  DEFAULT_WAITLIST_CAPACITY,
  MAX_RANGE_DAYS,
  ScheduleSlot,
  assertCapacity,
  assertRepeatWeeks,
  assertReschedule,
  assertUuid,
  assertWaitlistCapacity,
  averageFillRate,
  dayRange,
  findScheduleConflict,
  normaliseColor,
  parseDateTime,
  roomKey,
  sameMinute,
  scheduleConflictMessage,
  shiftWeeks,
} from './class-rules';
import { HOLDING_STATUSES, firstFreeSpot, waitlistPosition } from './occupancy';
import { OccupancyService } from './occupancy.service';

/** Order of the staff booking list: who is in, then the queue, then the rest. */
const STATUS_ORDER: BookingStatus[] = [
  BookingStatus.ATTENDED,
  BookingStatus.BOOKED,
  BookingStatus.NO_SHOW,
  BookingStatus.WAITLISTED,
  BookingStatus.LATE_CANCELLED,
  BookingStatus.CANCELLED,
];

@Injectable()
export class ClassesService {
  private readonly logger = new Logger(ClassesService.name);

  constructor(
    @InjectRepository(ClassSession) private readonly sessions: Repository<ClassSession>,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly occupancy: OccupancyService,
    private readonly rpc: RpcClient,
    private readonly events: EventBus,
  ) {}

  /** Sessions overlapping [from, to), so a class in progress still shows up. */
  async list(request: ListClassesRequest): Promise<ClassSessionDto[]> {
    const from = request.from ? parseDateTime(request.from, 'from') : new Date();
    const to = request.to ? parseDateTime(request.to, 'to') : new Date(from.getTime() + 7 * DAY_MS);
    if (to <= from) throw new BadRequestException('La date de fin doit être après la date de début.');
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      throw new BadRequestException(`Période trop longue (${MAX_RANGE_DAYS} jours maximum).`);
    }
    const sessions = await this.sessions.find({
      where: { startsAt: LessThan(to), endsAt: MoreThan(from) },
      order: { startsAt: 'ASC' },
    });
    return this.toDtos(sessions, request.memberId);
  }

  async create(request: CreateClassRequest): Promise<ClassSessionDto[]> {
    const title = request.title?.trim();
    if (!title) throw new BadRequestException('Le titre est obligatoire.');
    const startsAt = parseDateTime(request.startsAt, 'startsAt');
    const endsAt = parseDateTime(request.endsAt, 'endsAt');
    if (endsAt <= startsAt) throw new BadRequestException("L'heure de fin doit être après l'heure de début.");
    const capacity = assertCapacity(request.capacity ?? DEFAULT_CAPACITY);
    const waitlistCapacity = assertWaitlistCapacity(request.waitlistCapacity ?? DEFAULT_WAITLIST_CAPACITY);
    const repeatWeeks = assertRepeatWeeks(request.repeatWeeks);
    const color = normaliseColor(request.color);
    const coach = request.coachId ? await this.resolveCoach(request.coachId) : null;

    const rows = Array.from({ length: repeatWeeks + 1 }, (_, week) =>
      this.sessions.create({
        title,
        description: request.description?.trim() || null,
        coachId: coach?.id ?? null,
        coachName: coach?.name ?? null,
        room: request.room?.trim() || null,
        color,
        startsAt: shiftWeeks(startsAt, week),
        endsAt: shiftWeeks(endsAt, week),
        capacity,
        spotSelection: Boolean(request.spotSelection),
        waitlistCapacity,
      }),
    );
    // Every repeated week is checked before anything is saved.
    for (const row of rows) await this.assertSlotFree(this.sessions, row);
    const saved = await this.sessions.save(rows);
    const policy = loadBookingPolicy();
    return saved.map((session) => toSessionDto(session, undefined, policy));
  }

  /**
   * Place-related changes happen under the session lock; freed capacity promotes the waitlist.
   * Moving a session (drag and drop or editor): not once it started, not into the past, not onto a room
   * or a coach already taken; bookings follow the session and BOOKED members get their 2 h reminder
   * again for the new time.
   */
  async update({ id, data }: UpdateClassRequest): Promise<ClassSessionDto> {
    const current = await this.findSession(id);
    // Resolve the coach before locking: never hold a row lock during an RPC.
    const coach =
      data.coachId !== undefined && data.coachId !== current.coachId
        ? data.coachId
          ? await this.resolveCoach(data.coachId)
          : null
        : undefined;

    const { session, promoted } = await this.dataSource.transaction(async (manager) => {
      const session = await this.occupancy.lockSession(manager, current.id);
      const before = { startsAt: session.startsAt, endsAt: session.endsAt, room: session.room, coachId: session.coachId };
      if (data.title !== undefined) {
        const title = data.title?.trim();
        if (!title) throw new BadRequestException('Le titre est obligatoire.');
        session.title = title;
      }
      if (data.description !== undefined) session.description = data.description?.trim() || null;
      if (data.room !== undefined) session.room = data.room?.trim() || null;
      if (data.color !== undefined) session.color = normaliseColor(data.color);
      // The editor works to the minute: the same minute keeps the stored time (seconds included).
      if (data.startsAt !== undefined) {
        const startsAt = parseDateTime(data.startsAt, 'startsAt');
        if (!sameMinute(startsAt, session.startsAt)) session.startsAt = startsAt;
      }
      if (data.endsAt !== undefined) {
        const endsAt = parseDateTime(data.endsAt, 'endsAt');
        if (!sameMinute(endsAt, session.endsAt)) session.endsAt = endsAt;
      }
      if (session.endsAt <= session.startsAt) {
        throw new BadRequestException("L'heure de fin doit être après l'heure de début.");
      }
      assertReschedule(before, session);
      const startMoved = session.startsAt.getTime() !== before.startsAt.getTime();
      if (startMoved) {
        const checkedIn = await manager.count(Booking, { where: { sessionId: session.id, status: BookingStatus.ATTENDED } });
        if (checkedIn) {
          throw new BadRequestException('Des membres sont déjà pointés pour cette séance : elle ne peut plus être déplacée.');
        }
      }
      if (coach !== undefined) {
        session.coachId = coach?.id ?? null;
        session.coachName = coach?.name ?? null;
      }
      const slotChanged =
        startMoved ||
        session.endsAt.getTime() !== before.endsAt.getTime() ||
        roomKey(session.room) !== roomKey(before.room) ||
        session.coachId !== before.coachId;
      if (slotChanged) await this.assertSlotFree(manager.getRepository(ClassSession), session);
      if (data.waitlistCapacity !== undefined) session.waitlistCapacity = assertWaitlistCapacity(data.waitlistCapacity);

      const occupancy = await this.occupancy.loadOne(session.id, manager);
      const spotSelection = data.spotSelection ?? session.spotSelection;
      if (data.capacity !== undefined) {
        const capacity = assertCapacity(data.capacity);
        if (capacity < occupancy.booked) {
          throw new BadRequestException(
            `La capacité ne peut pas être inférieure au nombre de réservations (${occupancy.booked}).`,
          );
        }
        const lostSpot = spotSelection ? occupancy.takenSpots.find((spot) => spot > capacity) : undefined;
        if (lostSpot !== undefined) {
          throw new BadRequestException(`La place ${lostSpot} est réservée : impossible de réduire la capacité à ${capacity}.`);
        }
        session.capacity = capacity;
      }
      if (spotSelection && !session.spotSelection) await this.numberHeldPlaces(manager, session);
      session.spotSelection = Boolean(spotSelection);

      const saved = await manager.save(session);
      if (startMoved) {
        // A reminder already sent named the old time: the next sweep sends one with the new time.
        await manager.update(Booking, { sessionId: saved.id, status: BookingStatus.BOOKED }, { reminderSentAt: null });
      }
      return { session: saved, promoted: await this.occupancy.promote(manager, saved) };
    });
    this.occupancy.publishPromoted(promoted, session);
    const [dto] = await this.toDtos([session]);
    return dto;
  }

  async remove({ id }: IdRequest): Promise<OkResult> {
    const session = await this.findSession(id);
    const pending = await this.bookings.find({
      where: { sessionId: session.id, status: In([BookingStatus.BOOKED, BookingStatus.WAITLISTED]) },
    });
    await this.sessions.delete(session.id); // bookings go with it (FK ON DELETE CASCADE)
    if (session.startsAt > new Date()) {
      for (const booking of pending) {
        booking.status = BookingStatus.CANCELLED;
        this.events.publish(EVENTS.bookingCancelled, toBookingEvent(booking, session));
      }
    }
    return { ok: true };
  }

  /** Every booking of the session (booked, attended, no-show, waitlisted with position, cancelled). */
  async sessionBookings({ id }: IdRequest): Promise<BookingDto[]> {
    const session = await this.findSession(id);
    const [rows, occupancy] = await Promise.all([
      this.bookings.find({ where: { sessionId: session.id } }),
      this.occupancy.loadOne(session.id),
    ]);
    const position = (b: Booking) => waitlistPosition(occupancy, b.id);
    rows.sort(
      (a, b) =>
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
        (position(a) ?? 0) - (position(b) ?? 0) ||
        (a.spotNumber ?? Number.MAX_SAFE_INTEGER) - (b.spotNumber ?? Number.MAX_SAFE_INTEGER) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
    return rows.map((booking) => toBookingDto(booking, position(booking)));
  }

  /**
   * sessionsToday: sessions starting on `date` (default today); upcomingBookings / waitlisted: in
   * sessions not started yet; noShows30d and fillRate30d: sessions of the 30 days before the end of
   * `date` (or now). Fill counts every place that was held (booked, attended or no-show).
   */
  async stats({ date }: ClassStatsRequest): Promise<ClassStats> {
    const { start, end } = dayRange(date);
    const now = new Date();
    const reference = date ? end : now;
    const upcoming = (status: BookingStatus) =>
      this.bookings
        .createQueryBuilder('b')
        .innerJoin('b.session', 's')
        .where('b.status = :status', { status })
        .andWhere('s.startsAt >= :now', { now })
        .getCount();

    const [sessionsToday, upcomingBookings, waitlisted, recent] = await Promise.all([
      this.sessions
        .createQueryBuilder('s')
        .where('s.startsAt >= :start AND s.startsAt < :end', { start, end })
        .getCount(),
      upcoming(BookingStatus.BOOKED),
      upcoming(BookingStatus.WAITLISTED),
      this.sessions
        .createQueryBuilder('s')
        .where('s.startsAt >= :since AND s.startsAt < :reference', {
          since: new Date(reference.getTime() - 30 * DAY_MS),
          reference,
        })
        .getMany(),
    ]);
    const ids = recent.map((s) => s.id);
    const [held, noShows] = await Promise.all([
      this.countByStatus(ids, [...HOLDING_STATUSES, BookingStatus.NO_SHOW]),
      this.countByStatus(ids, [BookingStatus.NO_SHOW]),
    ]);
    const noShows30d = [...noShows.values()].reduce((sum, n) => sum + n, 0);
    return { sessionsToday, upcomingBookings, waitlisted, noShows30d, fillRate30d: averageFillRate(recent, held) };
  }

  async onCoachUpdated(userId: string, name: string): Promise<void> {
    const result = await this.sessions.update({ coachId: userId }, { coachName: name });
    if (result.affected) this.logger.log(`Coach name refreshed on ${result.affected} session(s)`);
  }

  async findSession(id: string): Promise<ClassSession> {
    const session = await this.sessions.findOne({ where: { id: assertUuid(id, 'Séance introuvable.') } });
    if (!session) throw new NotFoundException('Séance introuvable.');
    return session;
  }

  async toDtos(sessions: ClassSession[], memberId?: string): Promise<ClassSessionDto[]> {
    if (!sessions.length) return [];
    const ids = sessions.map((s) => s.id);
    const policy = loadBookingPolicy();
    const [occupancy, mine] = await Promise.all([
      this.occupancy.load(ids),
      memberId ? this.occupancy.memberBookings(ids, memberId) : Promise.resolve(null),
    ]);
    return sessions.map((s) =>
      toSessionDto(s, occupancy.get(s.id), policy, mine ? { booking: mine.get(s.id) ?? null } : undefined),
    );
  }

  private async countByStatus(sessionIds: string[], statuses: BookingStatus[]): Promise<Map<string, number>> {
    if (!sessionIds.length) return new Map();
    const rows = await this.bookings
      .createQueryBuilder('b')
      .select('b.sessionId', 'sessionId')
      .addSelect('COUNT(*)', 'count')
      .where('b.sessionId IN (:...ids)', { ids: sessionIds })
      .andWhere('b.status IN (:...statuses)', { statuses })
      .groupBy('b.sessionId')
      .getRawMany<{ sessionId: string; count: string }>();
    return new Map(rows.map((r) => [r.sessionId, Number(r.count)]));
  }

  /** 409 when an overlapping session already uses the room or the coach of `slot` (itself excluded). */
  private async assertSlotFree(repo: Repository<ClassSession>, slot: ScheduleSlot): Promise<void> {
    if (!roomKey(slot.room) && !slot.coachId) return;
    const overlapping = await repo.find({
      where: { startsAt: LessThan(slot.endsAt), endsAt: MoreThan(slot.startsAt), ...(slot.id ? { id: Not(slot.id) } : {}) },
    });
    const conflict = findScheduleConflict(slot, overlapping);
    if (conflict) throw new ConflictException(scheduleConflictMessage(conflict));
  }

  /** Turning spot selection on: give the people already in the class the first free numbers. */
  private async numberHeldPlaces(manager: EntityManager, session: ClassSession): Promise<void> {
    const held = await manager.find(Booking, {
      where: { sessionId: session.id, status: In(HOLDING_STATUSES) },
      order: { createdAt: 'ASC' },
    });
    const taken = new Set(held.map((b) => b.spotNumber).filter((n): n is number => typeof n === 'number'));
    for (const booking of held.filter((b) => b.spotNumber === null)) {
      booking.spotNumber = firstFreeSpot(taken, session.capacity);
      if (booking.spotNumber !== null) taken.add(booking.spotNumber);
      await manager.save(booking);
    }
  }

  private async resolveCoach(coachId: string): Promise<{ id: string; name: string }> {
    let user: UserDto;
    try {
      user = await this.rpc.send<UserDto>(PATTERNS.users.get, { id: coachId });
    } catch (err) {
      if (err instanceof RpcError && (err.statusCode === 404 || err.statusCode === 400)) {
        throw new NotFoundException('Coach introuvable.');
      }
      if (err instanceof RpcError && err.statusCode >= 500) {
        throw new ServiceUnavailableException('Service des utilisateurs indisponible, réessayez dans un instant.');
      }
      throw err;
    }
    if (user.role === Role.MEMBER) throw new BadRequestException("Cet utilisateur n'est pas un coach.");
    return { id: user.id, name: fullName(user) };
  }
}
