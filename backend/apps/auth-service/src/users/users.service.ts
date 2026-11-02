import { ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { ILike, In, Repository } from 'typeorm';
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
import { User } from './user.entity';

const BCRYPT_ROUNDS = 10;

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
    private readonly events: EventBus,
  ) {}

  /** Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD when none exists. */
  async onApplicationBootstrap(): Promise<void> {
    const admins = await this.users.count({ where: { role: Role.ADMIN } });
    if (admins > 0) return;
    const email = env('ADMIN_EMAIL', 'admin@meliora-gym.tn');
    await this.create({
      email,
      password: env('ADMIN_PASSWORD', 'Meliora2026!'),
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
        passwordHash: await bcrypt.hash(req.password, BCRYPT_ROUNDS),
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
    const user = await this.findOrFail(id);
    if (data.email !== undefined) {
      const email = normalizeEmail(data.email);
      if (email !== user.email && (await this.users.exist({ where: { email } }))) {
        throw new ConflictException('Un compte existe déjà avec cet e-mail.');
      }
      user.email = email;
    }
    if (data.role !== undefined && data.role !== user.role && user.role === Role.ADMIN) {
      await this.assertNotLastAdmin(user);
    }
    if (data.password) {
      user.passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
      user.tokenVersion += 1;
    }
    if (data.isActive === false && user.isActive) {
      if (user.role === Role.ADMIN) await this.assertNotLastAdmin(user);
      user.tokenVersion += 1;
    }
    const fields = ['role', 'firstName', 'lastName', 'phone', 'specialty', 'bio', 'avatarUrl', 'isActive'] as const;
    for (const field of fields) {
      if (data[field] !== undefined) (user as unknown as Record<string, unknown>)[field] = data[field];
    }
    const saved = await this.users.save(user);
    this.events.publish(EVENTS.userUpdated, this.toEvent(saved));
    return toUserDto(saved);
  }

  async remove(id: string): Promise<{ ok: true }> {
    const user = await this.findOrFail(id);
    if (user.role === Role.ADMIN) await this.assertNotLastAdmin(user);
    await this.users.delete(id);
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
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    return user;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email: normalizeEmail(email) } });
  }

  save(user: User): Promise<User> {
    return this.users.save(user);
  }

  private async assertNotLastAdmin(user: User): Promise<void> {
    const admins = await this.users.count({ where: { role: Role.ADMIN, isActive: true } });
    if (admins <= 1 && user.isActive) {
      throw new ConflictException('Impossible : c’est le dernier administrateur actif.');
    }
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
