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
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  BookingDto,
  BookingStatus,
  CancelBookingRequest,
  CreateBookingRequest,
  EVENTS,
  EventBus,
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
import { ACTIVE_BOOKING_STATUSES, assertUuid } from '../classes/class-rules';
import { toBookingDto, toBookingEvent, toSessionDto } from '../mappers';
import { Booking } from './booking.entity';

const HISTORY_LIMIT = 200;

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly classes: ClassesService,
    private readonly rpc: RpcClient,
    private readonly events: EventBus,
  ) {}

  async create({ sessionId, memberId }: CreateBookingRequest): Promise<BookingDto> {
    if (!memberId) throw new BadRequestException('Membre manquant.');
    const session = await this.classes.findSession(sessionId);
    if (session.startsAt <= new Date()) throw new BadRequestException('Cette séance a déjà commencé.');
    // Ask membership-service before taking the lock, never hold a row lock during an RPC.
    const member = await this.activeMember(memberId);

    const booking = await this.dataSource.transaction(async (manager) => {
      const locked = await this.lockSession(manager, session.id);
      const existing = await manager.findOne(Booking, { where: { sessionId: locked.id, memberId } });
      if (existing && existing.status !== BookingStatus.CANCELLED) {
        throw new ConflictException('Vous avez déjà réservé cette séance.');
      }
      await this.assertSpotLeft(manager, locked);
      const row = existing ?? manager.create(Booking, { sessionId: locked.id, memberId });
      row.status = BookingStatus.BOOKED;
      row.memberName = member.name;
      row.memberEmail = member.email;
      return manager.save(row);
    });

    this.events.publish(EVENTS.bookingCreated, toBookingEvent(booking, session));
    return this.withSession(booking, session, true);
  }

  async cancel({ bookingId, memberId }: CancelBookingRequest): Promise<BookingDto> {
    const booking = await this.findBooking(bookingId);
    if (memberId && booking.memberId !== memberId) {
      throw new ForbiddenException('Cette réservation ne vous appartient pas.');
    }
    if (booking.status === BookingStatus.CANCELLED) return this.withSession(booking, booking.session, true);
    if (memberId) {
      if (booking.status === BookingStatus.ATTENDED) {
        throw new BadRequestException('Présence déjà enregistrée pour cette séance.');
      }
      if (booking.session.startsAt <= new Date()) {
        throw new BadRequestException("Impossible d'annuler une séance déjà commencée.");
      }
    }
    booking.status = BookingStatus.CANCELLED;
    const saved = await this.bookings.save(booking);
    this.events.publish(EVENTS.bookingCancelled, toBookingEvent(saved, booking.session));
    return this.withSession(saved, booking.session, true);
  }

  /** Upcoming (not cancelled, soonest first) by default; full history (latest first) with includePast. */
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
        .andWhere('b.status != :cancelled', { cancelled: BookingStatus.CANCELLED })
        .orderBy('s.startsAt', 'ASC');
    }
    const rows = await query.getMany();
    const counts = await this.classes.countActiveBookings([...new Set(rows.map((b) => b.sessionId))]);
    return rows.map((b) =>
      toBookingDto(
        b,
        toSessionDto(b.session, counts.get(b.sessionId) ?? 0, b.status === BookingStatus.CANCELLED ? null : b.id),
      ),
    );
  }

  /** Staff / coach: mark attendance, cancel, or restore a booking (capacity is re-checked). */
  async setStatus({ bookingId, status }: SetBookingStatusRequest): Promise<BookingDto> {
    if (!Object.values(BookingStatus).includes(status)) throw new BadRequestException('Statut invalide.');
    const booking = await this.findBooking(bookingId);
    if (booking.status === status) return this.withSession(booking, booking.session);

    const saved = await this.dataSource.transaction(async (manager) => {
      if (booking.status === BookingStatus.CANCELLED) {
        await this.assertSpotLeft(manager, await this.lockSession(manager, booking.sessionId));
      }
      booking.status = status;
      return manager.save(booking);
    });
    if (status === BookingStatus.CANCELLED) {
      this.events.publish(EVENTS.bookingCancelled, toBookingEvent(saved, booking.session));
    }
    return this.withSession(saved, booking.session);
  }

  async onMemberUpdated(memberId: string, name: string, email: string | null): Promise<void> {
    await this.bookings.update({ memberId }, { memberName: name, memberEmail: email });
  }

  /** Frees the spots of a deleted member in sessions that have not started. */
  async onMemberDeleted(memberId: string): Promise<void> {
    const upcoming = await this.bookings
      .createQueryBuilder('b')
      .innerJoin('b.session', 's')
      .where('b.memberId = :memberId', { memberId })
      .andWhere('b.status = :status', { status: BookingStatus.BOOKED })
      .andWhere('s.startsAt > :now', { now: new Date() })
      .getMany();
    if (!upcoming.length) return;
    await this.bookings.update({ id: In(upcoming.map((b) => b.id)) }, { status: BookingStatus.CANCELLED });
    this.logger.log(`Cancelled ${upcoming.length} upcoming booking(s) of deleted member ${memberId}`);
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

  /** Row lock on the session so concurrent bookings cannot overfill it. */
  private async lockSession(manager: EntityManager, sessionId: string): Promise<ClassSession> {
    const session = await manager.findOne(ClassSession, {
      where: { id: sessionId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!session) throw new NotFoundException('Séance introuvable.');
    return session;
  }

  private async assertSpotLeft(manager: EntityManager, session: ClassSession): Promise<void> {
    const taken = await manager.count(Booking, {
      where: { sessionId: session.id, status: In(ACTIVE_BOOKING_STATUSES) },
    });
    if (taken >= session.capacity) throw new ConflictException('Séance complète.');
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
    const counts = await this.classes.countActiveBookings([session.id]);
    const bookingId = booking.status === BookingStatus.CANCELLED ? null : booking.id;
    return toBookingDto(
      booking,
      toSessionDto(session, counts.get(session.id) ?? 0, forMember ? bookingId : undefined),
    );
  }
}
