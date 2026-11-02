import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, MoreThan, Repository } from 'typeorm';
import {
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
import { ClassSession } from './class-session.entity';
import {
  ACTIVE_BOOKING_STATUSES,
  DAY_MS,
  DEFAULT_CAPACITY,
  MAX_RANGE_DAYS,
  assertCapacity,
  assertRepeatWeeks,
  assertUuid,
  averageFillRate,
  dayRange,
  normaliseColor,
  parseDateTime,
  shiftWeeks,
} from './class-rules';

@Injectable()
export class ClassesService {
  private readonly logger = new Logger(ClassesService.name);

  constructor(
    @InjectRepository(ClassSession) private readonly sessions: Repository<ClassSession>,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
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
      }),
    );
    const saved = await this.sessions.save(rows);
    return saved.map((session) => toSessionDto(session, 0));
  }

  async update({ id, data }: UpdateClassRequest): Promise<ClassSessionDto> {
    const session = await this.findSession(id);
    if (data.title !== undefined) {
      const title = data.title?.trim();
      if (!title) throw new BadRequestException('Le titre est obligatoire.');
      session.title = title;
    }
    if (data.description !== undefined) session.description = data.description?.trim() || null;
    if (data.room !== undefined) session.room = data.room?.trim() || null;
    if (data.color !== undefined) session.color = normaliseColor(data.color);
    if (data.startsAt !== undefined) session.startsAt = parseDateTime(data.startsAt, 'startsAt');
    if (data.endsAt !== undefined) session.endsAt = parseDateTime(data.endsAt, 'endsAt');
    if (session.endsAt <= session.startsAt) {
      throw new BadRequestException("L'heure de fin doit être après l'heure de début.");
    }
    if (data.coachId !== undefined && data.coachId !== session.coachId) {
      const coach = data.coachId ? await this.resolveCoach(data.coachId) : null;
      session.coachId = coach?.id ?? null;
      session.coachName = coach?.name ?? null;
    }
    if (data.capacity !== undefined) {
      const capacity = assertCapacity(data.capacity);
      const booked = (await this.countActiveBookings([session.id])).get(session.id) ?? 0;
      if (capacity < booked) {
        throw new BadRequestException(
          `La capacité ne peut pas être inférieure au nombre de réservations (${booked}).`,
        );
      }
      session.capacity = capacity;
    }
    const saved = await this.sessions.save(session);
    const [dto] = await this.toDtos([saved]);
    return dto;
  }

  async remove({ id }: IdRequest): Promise<OkResult> {
    const session = await this.findSession(id);
    const pending = await this.bookings.find({ where: { sessionId: session.id, status: BookingStatus.BOOKED } });
    await this.sessions.delete(session.id); // bookings go with it (FK ON DELETE CASCADE)
    if (session.startsAt > new Date()) {
      for (const booking of pending) this.events.publish(EVENTS.bookingCancelled, toBookingEvent(booking, session));
    }
    return { ok: true };
  }

  async sessionBookings({ id }: IdRequest) {
    const session = await this.findSession(id);
    const rows = await this.bookings.find({ where: { sessionId: session.id }, order: { createdAt: 'ASC' } });
    return rows.map((booking) => toBookingDto(booking));
  }

  /**
   * sessionsToday: sessions starting on `date` (default today); upcomingBookings: BOOKED spots in
   * sessions not started yet; fillRate30d: over the 30 days before the end of `date` (or now).
   */
  async stats({ date }: ClassStatsRequest): Promise<ClassStats> {
    const { start, end } = dayRange(date);
    const now = new Date();
    const reference = date ? end : now;

    const [sessionsToday, upcomingBookings, recent] = await Promise.all([
      this.sessions
        .createQueryBuilder('s')
        .where('s.startsAt >= :start AND s.startsAt < :end', { start, end })
        .getCount(),
      this.bookings
        .createQueryBuilder('b')
        .innerJoin('b.session', 's')
        .where('b.status = :status', { status: BookingStatus.BOOKED })
        .andWhere('s.startsAt >= :now', { now })
        .getCount(),
      this.sessions
        .createQueryBuilder('s')
        .where('s.startsAt >= :since AND s.startsAt < :reference', {
          since: new Date(reference.getTime() - 30 * DAY_MS),
          reference,
        })
        .getMany(),
    ]);
    const booked = await this.countActiveBookings(recent.map((s) => s.id));
    return { sessionsToday, upcomingBookings, fillRate30d: averageFillRate(recent, booked) };
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
    const counts = await this.countActiveBookings(ids);
    let mine = new Map<string, string>();
    if (memberId) {
      const rows = await this.bookings.find({
        where: { sessionId: In(ids), memberId, status: In(ACTIVE_BOOKING_STATUSES) },
      });
      mine = new Map(rows.map((b) => [b.sessionId, b.id]));
    }
    return sessions.map((s) =>
      toSessionDto(s, counts.get(s.id) ?? 0, memberId ? (mine.get(s.id) ?? null) : undefined),
    );
  }

  /** BOOKED + ATTENDED bookings per session. */
  async countActiveBookings(sessionIds: string[]): Promise<Map<string, number>> {
    if (!sessionIds.length) return new Map();
    const rows = await this.bookings
      .createQueryBuilder('b')
      .select('b.sessionId', 'sessionId')
      .addSelect('COUNT(*)', 'count')
      .where('b.sessionId IN (:...ids)', { ids: sessionIds })
      .andWhere('b.status IN (:...statuses)', { statuses: ACTIVE_BOOKING_STATUSES })
      .groupBy('b.sessionId')
      .getRawMany<{ sessionId: string; count: string }>();
    return new Map(rows.map((r) => [r.sessionId, Number(r.count)]));
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
