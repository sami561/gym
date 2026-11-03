import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, Repository } from 'typeorm';
import {
  CreateMemberRequest,
  CreateMemberResult,
  Entitlement,
  EntitlementsRequest,
  EVENTS,
  EventBus,
  ListMembersRequest,
  MemberDto,
  MemberListItem,
  MemberProfile,
  MemberStatus,
  Paginated,
  PATTERNS,
  Role,
  RpcClient,
  RpcError,
  SubscriptionStatus,
  UpdateMemberRequest,
  UserDto,
  UserEvent,
  formatMemberCode,
  generatePassword,
  toDateOnly,
} from '@app/common';
import { Member } from './member.entity';
import { MemberPhotoEntity } from './member-photo.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { Payment } from '../payments/payment.entity';
import { toMemberDto, toPaymentDto, toSubscriptionDto } from '../mappers';
import { accessWindows, computeMembershipState } from '../subscriptions/membership-state';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class MembersService implements OnModuleInit {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    @InjectRepository(Member) private readonly members: Repository<Member>,
    @InjectRepository(Subscription) private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectDataSource() private readonly db: DataSource,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly rpc: RpcClient,
    private readonly events: EventBus,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.db.query('CREATE SEQUENCE IF NOT EXISTS member_code_seq START 1');
  }

  /**
   * Creates the identity in auth-service, then the member here (same id).
   * If anything fails after the user was created, the user is deleted again (compensation).
   */
  async create(req: CreateMemberRequest): Promise<CreateMemberResult> {
    const temporaryPassword = req.password ? null : generatePassword();
    const user = await this.rpc.send<UserDto>(PATTERNS.users.create, {
      email: req.email,
      password: req.password ?? temporaryPassword,
      role: Role.MEMBER,
      firstName: req.firstName,
      lastName: req.lastName,
      phone: req.phone ?? null,
    });

    let member: Member;
    try {
      const [{ nextval }] = await this.db.query(`SELECT nextval('member_code_seq')`);
      member = await this.members.save(
        this.members.create({
          id: user.id,
          memberCode: formatMemberCode(Number(nextval)),
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          birthDate: req.birthDate ?? null,
          gender: req.gender ?? null,
          emergencyContact: req.emergencyContact ?? null,
          notes: req.notes ?? null,
          status: MemberStatus.ACTIVE,
        }),
      );
    } catch (err) {
      await this.rpc.send(PATTERNS.users.remove, { id: user.id }).catch((e: RpcError) => {
        this.logger.error(`Compensation failed, orphan user ${user.id}: ${e.message}`);
      });
      throw err;
    }

    this.events.publish(EVENTS.memberCreated, {
      memberId: member.id,
      memberCode: member.memberCode,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      phone: member.phone,
      status: member.status,
      joinedAt: member.joinedAt.toISOString(),
    });
    await this.subscriptionsService.publishEntitlement(member.id);

    const subscription = req.planId
      ? await this.subscriptionsService.create({
          memberId: member.id,
          planId: req.planId,
          payment: req.payment,
          actor: req.actor,
        })
      : null;

    return { member: toMemberDto(member), subscription, temporaryPassword };
  }

  async list(req: ListMembersRequest): Promise<Paginated<MemberListItem>> {
    const page = Math.max(1, req.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, req.pageSize ?? 20));
    const today = toDateOnly();
    const status = req.status ?? 'all';

    const qb = this.members.createQueryBuilder('m');
    const activeSub = `EXISTS (SELECT 1 FROM subscriptions s WHERE s."memberId" = m.id AND s.status = :activeStatus
      AND s."startDate" <= :today AND s."endDate" >= :today)`;
    qb.setParameters({ activeStatus: SubscriptionStatus.ACTIVE, today });

    if (req.search?.trim()) {
      const search = `%${req.search.trim()}%`;
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('m.firstName ILIKE :search', { search })
            .orWhere('m.lastName ILIKE :search', { search })
            .orWhere('m.email ILIKE :search', { search })
            .orWhere('m.phone ILIKE :search', { search })
            .orWhere('m.memberCode ILIKE :search', { search })
            .orWhere(`(m."firstName" || ' ' || m."lastName") ILIKE :search`, { search }),
        ),
      );
    }
    if (status === 'active') qb.andWhere(`m.status = :ms AND ${activeSub}`, { ms: MemberStatus.ACTIVE });
    if (status === 'expired') qb.andWhere(`m.status = :ms AND NOT ${activeSub}`, { ms: MemberStatus.ACTIVE });
    if (status === 'suspended') qb.andWhere('m.status = :ms', { ms: MemberStatus.SUSPENDED });

    const [rows, total] = await qb
      .orderBy('m.joinedAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    const subs = rows.length
      ? await this.subscriptions.find({ where: { memberId: In(rows.map((r) => r.id)) } })
      : [];
    const items = rows.map((member) => {
      const state = computeMembershipState(
        member.status,
        subs.filter((s) => s.memberId === member.id).map(toSubscriptionDto),
        today,
      );
      const last = subs
        .filter((s) => s.memberId === member.id && s.status !== SubscriptionStatus.CANCELLED)
        .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
      return {
        ...toMemberDto(member),
        membership: {
          active: state.active,
          planName: (state.current ?? last)?.plan.name ?? null,
          endDate: state.validUntil ?? last?.endDate ?? null,
        },
      };
    });
    return { items, total, page, pageSize };
  }

  async get(id: string): Promise<MemberDto> {
    return toMemberDto(await this.findOrFail(id));
  }

  async profile(id: string): Promise<MemberProfile> {
    const member = await this.findOrFail(id);
    const [subs, payments] = await Promise.all([
      this.subscriptions.find({ where: { memberId: id }, order: { startDate: 'DESC' } }),
      this.payments.find({
        where: { memberId: id },
        relations: { member: true, subscription: true },
        order: { paidAt: 'DESC' },
      }),
    ]);
    const subscriptions = subs.map(toSubscriptionDto);
    return {
      member: toMemberDto(member),
      membership: computeMembershipState(member.status, subscriptions),
      subscriptions,
      payments: payments.map(toPaymentDto),
    };
  }

  async update({ id, data }: UpdateMemberRequest): Promise<MemberDto> {
    const member = await this.findOrFail(id);
    const identityChanged =
      (data.firstName !== undefined && data.firstName !== member.firstName) ||
      (data.lastName !== undefined && data.lastName !== member.lastName) ||
      (data.phone !== undefined && data.phone !== member.phone);
    if (identityChanged) {
      // auth-service owns the identity: keep both copies in sync.
      await this.rpc.send(PATTERNS.users.update, {
        id,
        data: { firstName: data.firstName, lastName: data.lastName, phone: data.phone },
      });
    }
    const statusChanged = data.status !== undefined && data.status !== member.status;
    Object.assign(member, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)));
    const saved = await this.members.save(member);
    this.publishUpdated(saved);
    if (statusChanged) await this.subscriptionsService.publishEntitlement(saved.id);
    return toMemberDto(saved);
  }

  async remove(id: string): Promise<{ ok: true }> {
    await this.findOrFail(id);
    await this.deleteWithPhoto(id);
    await this.rpc.send(PATTERNS.users.remove, { id }).catch((e: RpcError) => {
      if (e.statusCode !== 404) this.logger.warn(`Could not delete auth user ${id}: ${e.message}`);
    });
    this.events.publish(EVENTS.memberDeleted, { memberId: id });
    return { ok: true };
  }

  /** Mirror identity changes made in auth-service (e.g. a member editing their own profile). */
  async onUserUpdated(event: UserEvent): Promise<void> {
    const member = await this.members.findOne({ where: { id: event.userId } });
    if (!member) return;
    const changed =
      member.firstName !== event.firstName ||
      member.lastName !== event.lastName ||
      member.email !== event.email ||
      member.phone !== event.phone;
    if (!changed) return;
    Object.assign(member, {
      firstName: event.firstName,
      lastName: event.lastName,
      email: event.email,
      phone: event.phone,
    });
    this.publishUpdated(await this.members.save(member));
  }

  async onUserDeleted(userId: string): Promise<void> {
    if (await this.deleteWithPhoto(userId)) this.events.publish(EVENTS.memberDeleted, { memberId: userId });
  }

  /**
   * Deletes the member with its photo (personal data) in one transaction, locking the member row first like a
   * photo upload does; subscriptions and payments go with it (FK cascade). False when there was no member.
   */
  private deleteWithPhoto(id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const member = await tx.findOne(Member, { where: { id }, lock: { mode: 'pessimistic_write' } });
      await tx.delete(MemberPhotoEntity, { memberId: id });
      if (!member) return false;
      await tx.delete(Member, id);
      return true;
    });
  }

  async entitlements(req: EntitlementsRequest): Promise<Entitlement[]> {
    const where = req?.memberIds?.length ? { id: In(req.memberIds) } : {};
    const members = await this.members.find({ where });
    if (!members.length) return [];
    const subs = await this.subscriptions.find({
      where: { memberId: In(members.map((m) => m.id)), status: SubscriptionStatus.ACTIVE },
    });
    return members.map((m) => ({
      memberId: m.id,
      memberCode: m.memberCode,
      firstName: m.firstName,
      lastName: m.lastName,
      status: m.status,
      windows: accessWindows(subs.filter((s) => s.memberId === m.id)),
    }));
  }

  async findOrFail(id: string): Promise<Member> {
    if (!id) throw new BadRequestException('Identifiant du membre manquant.');
    const member = await this.members.findOne({ where: { id } });
    if (!member) throw new NotFoundException('Membre introuvable.');
    return member;
  }

  private publishUpdated(member: Member): void {
    this.events.publish(EVENTS.memberUpdated, {
      memberId: member.id,
      memberCode: member.memberCode,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      phone: member.phone,
      status: member.status,
    });
  }
}
