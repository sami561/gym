import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, MoreThanOrEqual, Repository } from 'typeorm';
import {
  BookingDto,
  BookingPolicy,
  BookingStatus,
  CancelBookingRequest,
  CreateBookingRequest,
  EVENTS,
  EventBus,
  MemberBookingStanding,
  MemberProfile,
  MemberStatus,
  MyBookingsRequest,
  PATTERNS,
  RpcClient,
  RpcError,
  SetBookingStatusRequest,
  fullName,
} from '@app/common';
import { ClassSession } from '../classes/class-session.entity';
import { ClassesService } from '../classes/classes.service';
import { OccupancyService } from '../classes/occupancy.service';
import { assertUuid } from '../classes/class-rules';
import {
  Standing,
  assertBookingOpen,
  bookingWindow,
  computeStanding,
  formatDateTimeFr,
  loadBookingPolicy,
  standingLookbackStart,
} from '../classes/booking-policy';
import { HOLDING_STATUSES, STRIKE_STATUSES, decideBooking, firstFreeSpot, waitlistPosition } from '../classes/occupancy';
import { toBookingDto, toBookingEvent, toSessionDto } from '../mappers';
import { Booking } from './booking.entity';

const HISTORY_LIMIT = 200;
const CANCELLED_STATUSES = [BookingStatus.CANCELLED, BookingStatus.LATE_CANCELLED];

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly classes: ClassesService,
    private readonly occupancy: OccupancyService,
    private readonly rpc: RpcClient,
    private readonly events: EventBus,
  ) {}

  policy(): BookingPolicy {
    return loadBookingPolicy();
  }

  async standing({ memberId }: { memberId: string }): Promise<MemberBookingStanding> {
    if (!memberId) throw new BadRequestException('Membre manquant.');
    const standing = await this.memberStanding(memberId, loadBookingPolicy(), new Date());
    return {
      memberId,
      strikes30d: standing.strikes30d,
      blockedUntil: standing.blockedUntil ? standing.blockedUntil.toISOString() : null,
    };
  }

  /**
   * BOOKED while places remain (spot required with spot selection), WAITLISTED when the class is
   * full and the waitlist has room. Checks the booking window, strikes and the membership first.
   */
  async create({ sessionId, memberId, spotNumber }: CreateBookingRequest): Promise<BookingDto> {
    if (!memberId) throw new BadRequestException('Membre manquant.');
    const policy = loadBookingPolicy();
    const now = new Date();
    const session = await this.classes.findSession(sessionId);
    assertBookingOpen(session.startsAt, policy, now);
    const standing = await this.memberStanding(memberId, policy, now);
    if (standing.blockedUntil) {
      throw new ForbiddenException(
        `Réservations suspendues jusqu'au ${formatDateTimeFr(standing.blockedUntil)} (trop d'absences ou d'annulations tardives).`,
      );
    }
    // Ask membership-service before taking the lock, never hold a row lock during an RPC.
    const member = await this.activeMember(memberId);

    const { booking, locked, promoted } = await this.dataSource.transaction(async (manager) => {
      const locked = await this.occupancy.lockSession(manager, session.id);
      // Free places go to the queue first (e.g. after a capacity change).
      const promoted = await this.occupancy.promote(manager, locked, now);
      const existing = await manager.findOne(Booking, { where: { sessionId: locked.id, memberId } });
      if (existing?.status === BookingStatus.WAITLISTED) {
        throw new ConflictException("Vous êtes déjà sur la liste d'attente de cette séance.");
      }
      if (existing && !CANCELLED_STATUSES.includes(existing.status)) {
        throw new ConflictException('Vous avez déjà réservé cette séance.');
      }
      const decision = decideBooking(locked, await this.occupancy.loadOne(locked.id, manager), spotNumber);
      const row = existing ?? manager.create(Booking, { sessionId: locked.id, memberId });
      row.status = decision.status;
      row.spotNumber = decision.spotNumber;
      row.queuedAt = decision.status === BookingStatus.WAITLISTED ? now : null;
      row.memberName = member.name;
      row.memberEmail = member.email;
      row.checkedInAt = null;
      row.reminderSentAt = null;
      row.strikeAt = null;
      return { booking: await manager.save(row), locked, promoted };
    });

    this.occupancy.publishPromoted(promoted, locked);
    const dto = await this.withSession(booking, locked, true);
    this.events.publish(EVENTS.bookingCreated, toBookingEvent(booking, locked, dto.waitlistPosition));
    return dto;
  }

  /**
   * Member: before the cancellation deadline → CANCELLED, after → LATE_CANCELLED (a strike); leaving
   * the waitlist never counts. Staff (no memberId) always cancels without a strike.
   * A freed place promotes the first waitlisted member.
   */
  async cancel({ bookingId, memberId }: CancelBookingRequest): Promise<BookingDto> {
    const policy = loadBookingPolicy();
    const now = new Date();
    const found = await this.findBooking(bookingId);
    if (memberId && found.memberId !== memberId) {
      throw new ForbiddenException('Cette réservation ne vous appartient pas.');
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const locked = await this.occupancy.lockSession(manager, found.sessionId);
      const row = await manager.findOneOrFail(Booking, { where: { id: found.id } });
      if (CANCELLED_STATUSES.includes(row.status)) return { row, locked, promoted: [] as Booking[], changed: false };

      let next = BookingStatus.CANCELLED;
      if (memberId) {
        if (row.status === BookingStatus.ATTENDED) {
          throw new BadRequestException('Présence déjà enregistrée pour cette séance.');
        }
        if (row.status === BookingStatus.NO_SHOW) throw new BadRequestException('Séance terminée : absence déjà enregistrée.');
        if (row.status === BookingStatus.BOOKED) {
          if (locked.startsAt <= now) throw new BadRequestException("Impossible d'annuler une séance déjà commencée.");
          if (now >= bookingWindow(locked.startsAt, policy).cancelDeadline) next = BookingStatus.LATE_CANCELLED;
        }
      }
      const freed = HOLDING_STATUSES.includes(row.status);
      row.status = next;
      row.queuedAt = null;
      row.strikeAt = next === BookingStatus.LATE_CANCELLED ? now : null;
      const saved = await manager.save(row);
      const promoted = freed ? await this.occupancy.promote(manager, locked, now) : [];
      return { row: saved, locked, promoted, changed: true };
    });

    this.occupancy.publishPromoted(result.promoted, result.locked);
    if (result.changed) this.events.publish(EVENTS.bookingCancelled, toBookingEvent(result.row, result.locked));
    return this.withSession(result.row, result.locked, true);
  }

  /** Upcoming (soonest first, cancelled hidden) by default; full history (latest first) with includePast. */
  async mine({ memberId, includePast }: MyBookingsRequest): Promise<BookingDto[]> {
    if (!memberId) throw new BadRequestException('Membre manquant.');
    const query = this.bookings
      .createQueryBuilder('b')
      .innerJoinAndSelect('b.session', 's')
      .where('b.memberId = :memberId', { memberId });
    if (includePast) {
      query.orderBy('s.startsAt', 'DESC').take(HISTORY_LIMIT);
    } else {
      query
        .andWhere('s.endsAt > :now', { now: new Date() })
        .andWhere('b.status NOT IN (:...cancelled)', { cancelled: CANCELLED_STATUSES })
        .orderBy('s.startsAt', 'ASC');
    }
    const rows = await query.getMany();
    const policy = loadBookingPolicy();
    const occupancy = await this.occupancy.load([...new Set(rows.map((b) => b.sessionId))]);
    return rows.map((b) => {
      const occ = occupancy.get(b.sessionId);
      return toBookingDto(b, waitlistPosition(occ, b.id), toSessionDto(b.session, occ, policy, { booking: b }));
    });
  }

  /**
   * Staff / coach: ATTENDED, NO_SHOW, LATE_CANCELLED, CANCELLED or BOOKED (re-checks a place).
   * WAITLISTED is only set by the booking flow.
   */
  async setStatus({ bookingId, status }: SetBookingStatusRequest): Promise<BookingDto> {
    if (!Object.values(BookingStatus).includes(status)) throw new BadRequestException('Statut invalide.');
    if (status === BookingStatus.WAITLISTED) {
      throw new BadRequestException("La liste d'attente est gérée automatiquement par les réservations.");
    }
    const now = new Date();
    const found = await this.findBooking(bookingId);

    const result = await this.dataSource.transaction(async (manager) => {
      const locked = await this.occupancy.lockSession(manager, found.sessionId);
      const row = await manager.findOneOrFail(Booking, { where: { id: found.id } });
      if (row.status === status) return { row, locked, promoted: [] as Booking[], changed: false };

      const wasHolding = HOLDING_STATUSES.includes(row.status);
      const willHold = HOLDING_STATUSES.includes(status);
      if (willHold && !wasHolding) {
        const occ = await this.occupancy.loadOne(locked.id, manager);
        // A walk-in marked ATTENDED is always accepted; a plain BOOKED needs a free place.
        if (status === BookingStatus.BOOKED && occ.booked >= locked.capacity) {
          throw new ConflictException('Séance complète.');
        }
        const taken = new Set(occ.takenSpots);
        row.spotNumber = !locked.spotSelection
          ? null
          : row.spotNumber && row.spotNumber <= locked.capacity && !taken.has(row.spotNumber)
            ? row.spotNumber
            : firstFreeSpot(taken, locked.capacity);
      }
      const wasStrike = STRIKE_STATUSES.includes(row.status);
      row.status = status;
      row.queuedAt = null;
      row.strikeAt = STRIKE_STATUSES.includes(status) ? (wasStrike && row.strikeAt ? row.strikeAt : now) : null;
      if (status === BookingStatus.ATTENDED) row.checkedInAt = row.checkedInAt ?? now;
      const saved = await manager.save(row);
      const promoted = wasHolding && !willHold ? await this.occupancy.promote(manager, locked, now) : [];
      return { row: saved, locked, promoted, changed: true };
    });

    this.occupancy.publishPromoted(result.promoted, result.locked);
    if (result.changed && CANCELLED_STATUSES.includes(status)) {
      this.events.publish(EVENTS.bookingCancelled, toBookingEvent(result.row, result.locked));
    }
    return this.withSession(result.row, result.locked);
  }

  async onMemberUpdated(memberId: string, name: string, email: string | null): Promise<void> {
    await this.bookings.update({ memberId }, { memberName: name, memberEmail: email });
  }

  /** Frees the places / waitlist entries of a deleted member in sessions that have not started. */
  async onMemberDeleted(memberId: string): Promise<void> {
    const upcoming = await this.bookings
      .createQueryBuilder('b')
      .innerJoin('b.session', 's')
      .where('b.memberId = :memberId', { memberId })
      .andWhere('b.status IN (:...statuses)', { statuses: [BookingStatus.BOOKED, BookingStatus.WAITLISTED] })
      .andWhere('s.startsAt > :now', { now: new Date() })
      .getMany();
    for (const booking of upcoming) await this.cancel({ bookingId: booking.id });
    if (upcoming.length) this.logger.log(`Cancelled ${upcoming.length} upcoming booking(s) of deleted member ${memberId}`);
  }

  private async memberStanding(memberId: string, policy: BookingPolicy, now: Date): Promise<Standing> {
    const strikes = await this.bookings.find({
      select: { id: true, strikeAt: true },
      where: {
        memberId,
        status: In(STRIKE_STATUSES),
        strikeAt: MoreThanOrEqual(standingLookbackStart(policy, now)),
      },
    });
    return computeStanding(
      strikes.map((b) => b.strikeAt).filter((d): d is Date => d instanceof Date),
      policy,
      now,
    );
  }

  private async activeMember(memberId: string): Promise<{ name: string; email: string | null }> {
    let profile: MemberProfile;
    try {
      profile = await this.rpc.send<MemberProfile>(PATTERNS.members.profile, { id: memberId });
    } catch (err) {
      if (err instanceof RpcError && (err.statusCode === 404 || err.statusCode === 400)) {
        throw new NotFoundException('Membre introuvable.');
      }
      if (err instanceof RpcError && err.statusCode >= 500) {
        throw new ServiceUnavailableException('Service des abonnements indisponible, réessayez dans un instant.');
      }
      throw err;
    }
    if (!profile.membership.active || profile.member.status !== MemberStatus.ACTIVE) {
      throw new ForbiddenException('Abonnement inactif : renouvelez votre abonnement pour réserver.');
    }
    return { name: fullName(profile.member), email: profile.member.email || null };
  }

  private async findBooking(bookingId: string): Promise<Booking> {
    const booking = await this.bookings.findOne({
      where: { id: assertUuid(bookingId, 'Réservation introuvable.') },
      relations: { session: true },
    });
    if (!booking) throw new NotFoundException('Réservation introuvable.');
    return booking;
  }

  private async withSession(booking: Booking, session: ClassSession, forMember = false): Promise<BookingDto> {
    const occupancy = await this.occupancy.loadOne(session.id);
    return toBookingDto(
      booking,
      waitlistPosition(occupancy, booking.id),
      toSessionDto(session, occupancy, loadBookingPolicy(), forMember ? { booking } : undefined),
    );
  }
}
