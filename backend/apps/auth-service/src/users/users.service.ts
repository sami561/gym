import { ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, ILike, In, Repository } from 'typeorm';
import {
  CreateUserRequest,
  EVENTS,
  EventBus,
  ListUsersRequest,
  PublicCoach,
  Role,
  UpdateUserRequest,
  UserDto,
  env,
} from '@app/common';
import { RefreshSessionsService } from '../sessions/refresh-sessions.service';
import { hashPassword } from './passwords';
import { User } from './user.entity';
import { bootstrapAdminPassword, isActiveAdmin, removesActiveAdmin } from './user-rules';

/**
 * Transaction-scoped advisory lock taken by every change that takes an active admin away (demotion,
 * deactivation, deletion): they run one after the other, so two of them cannot both pass the last-admin check.
 */
const LAST_ADMIN_LOCK_KEY = 74_270_101;

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    specialty: user.specialty,
    bio: user.bio,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class UsersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessions: RefreshSessionsService,
    private readonly events: EventBus,
  ) {}

  /**
   * Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD when none exists. In production
   * ADMIN_PASSWORD is required: without it the service stops at boot instead of using the dev default.
   */
  async onApplicationBootstrap(): Promise<void> {
    const admins = await this.users.count({ where: { role: Role.ADMIN } });
    if (admins > 0) return;
    const email = env('ADMIN_EMAIL', 'admin@meliora-gym.tn');
    await this.create({
      email,
      password: bootstrapAdminPassword(env('NODE_ENV', 'development'), env('ADMIN_PASSWORD', '')),
      role: Role.ADMIN,
      firstName: env('ADMIN_FIRST_NAME', 'Admin'),
      lastName: env('ADMIN_LAST_NAME', 'Meliora'),
    });
    this.logger.log(`Bootstrap admin created: ${email}`);
  }

  async create(req: CreateUserRequest): Promise<UserDto> {
    const email = normalizeEmail(req.email);
    if (await this.users.exist({ where: { email } })) {
      throw new ConflictException('Un compte existe déjà avec cet e-mail.');
    }
    const user = await this.users.save(
      this.users.create({
        email,
        passwordHash: await hashPassword(req.password),
        role: req.role,
        firstName: req.firstName.trim(),
        lastName: req.lastName.trim(),
        phone: req.phone ?? null,
        specialty: req.specialty ?? null,
        bio: req.bio ?? null,
        avatarUrl: req.avatarUrl ?? null,
      }),
    );
    this.events.publish(EVENTS.userCreated, this.toEvent(user));
    return toUserDto(user);
  }

  async list(req: ListUsersRequest): Promise<UserDto[]> {
    const search = req.search?.trim();
    const base = req.role ? { role: req.role } : {};
    const where = search
      ? [
          { ...base, firstName: ILike(`%${search}%`) },
          { ...base, lastName: ILike(`%${search}%`) },
          { ...base, email: ILike(`%${search}%`) },
        ]
      : base;
    const users = await this.users.find({ where, order: { createdAt: 'DESC' } });
    return users.map(toUserDto);
  }

  async get(id: string): Promise<UserDto> {
    return toUserDto(await this.findOrFail(id));
  }

  async getMany(ids: string[]): Promise<UserDto[]> {
    if (!ids.length) return [];
    const users = await this.users.find({ where: { id: In(ids) } });
    return users.map(toUserDto);
  }

  async update({ id, data }: UpdateUserRequest): Promise<UserDto> {
    // bcrypt is slow: hash before the transaction takes its locks.
    const passwordHash = data.password ? await hashPassword(data.password) : null;
    // READ COMMITTED: the last-admin count, taken after the lock, must see the changes committed before it.
    const saved = await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const user = await this.lockForChange(manager, id, (current) => removesActiveAdmin(current, data));
      if (data.email !== undefined) {
        const email = normalizeEmail(data.email);
        if (email !== user.email && (await manager.exists(User, { where: { email } }))) {
          throw new ConflictException('Un compte existe déjà avec cet e-mail.');
        }
        user.email = email;
      }
      // A password reset by staff or a deactivation ends every session of the user.
      const endSessions = passwordHash !== null || (data.isActive === false && user.isActive);
      if (passwordHash) user.passwordHash = passwordHash;
      if (endSessions) user.tokenVersion += 1;
      const fields = ['role', 'firstName', 'lastName', 'phone', 'specialty', 'bio', 'avatarUrl', 'isActive'] as const;
      for (const field of fields) {
        if (data[field] !== undefined) (user as unknown as Record<string, unknown>)[field] = data[field];
      }
      const updated = await manager.save(user);
      if (endSessions) await this.sessions.revokeAll(user.id, manager);
      return updated;
    });
    this.events.publish(EVENTS.userUpdated, this.toEvent(saved));
    return toUserDto(saved);
  }

  async remove(id: string): Promise<{ ok: true }> {
    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await this.lockForChange(manager, id, isActiveAdmin);
      // Its refresh sessions go with it (ON DELETE CASCADE).
      await manager.delete(User, id);
    });
    this.events.publish(EVENTS.userDeleted, { userId: id });
    return { ok: true };
  }

  async publicCoaches(): Promise<PublicCoach[]> {
    const coaches = await this.users.find({
      where: { role: Role.COACH, isActive: true },
      order: { firstName: 'ASC' },
    });
    return coaches.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      specialty: c.specialty,
      bio: c.bio,
      avatarUrl: c.avatarUrl,
    }));
  }

  async findOrFail(id: string): Promise<User> {
    // An undefined id would drop the condition and match any user.
    const user = id ? await this.users.findOne({ where: { id } }) : null;
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    return user;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email: normalizeEmail(email) } });
  }

  /**
   * Only lastLoginAt: a save() of the row login read before bcrypt would write back every column
   * changed meanwhile (isActive, role, passwordHash, tokenVersion).
   */
  async recordLogin(id: string, at: Date): Promise<void> {
    await this.users.update({ id }, { lastLoginAt: at });
  }

  /**
   * Loads the user for a change inside `manager`'s transaction, row-locked so that concurrent changes of
   * one user apply one after the other. When `removesAdmin` says the change takes an active admin away,
   * it also takes the last-admin lock, then counts the active admins on committed data.
   */
  private async lockForChange(
    manager: EntityManager,
    id: string,
    removesAdmin: (user: User) => boolean,
  ): Promise<User> {
    const user = id ? await manager.findOne(User, { where: { id }, lock: { mode: 'pessimistic_write' } }) : null;
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    if (removesAdmin(user)) {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [LAST_ADMIN_LOCK_KEY]);
      const admins = await manager.count(User, { where: { role: Role.ADMIN, isActive: true } });
      if (admins <= 1) throw new ConflictException('Impossible : c’est le dernier administrateur actif.');
    }
    return user;
  }

  private toEvent(user: User) {
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
    };
  }
}
