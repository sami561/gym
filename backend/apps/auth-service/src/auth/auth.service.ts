import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import {
  AuthResult,
  ChangePasswordRequest,
  JwtPayload,
  LoginRequest,
  LogoutRequest,
  RefreshRequest,
  env,
  envInt,
} from '@app/common';
import { User } from '../users/user.entity';
import { toUserDto, UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async login({ email, password }: LoginRequest): Promise<AuthResult> {
    const user = await this.users.findByEmail(email ?? '');
    if (!user || !(await bcrypt.compare(password ?? '', user.passwordHash))) {
      throw new UnauthorizedException('E-mail ou mot de passe incorrect.');
    }
    if (!user.isActive) throw new ForbiddenException('Ce compte est désactivé. Contactez l’accueil.');
    user.lastLoginAt = new Date();
    return this.issue(await this.users.save(user));
  }

  async refresh({ refreshToken }: RefreshRequest): Promise<AuthResult> {
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(refreshToken ?? '', { secret: env('JWT_REFRESH_SECRET') });
    } catch {
      throw new UnauthorizedException('Session expirée, reconnectez-vous.');
    }
    const user = payload.type === 'refresh' ? await this.users.findOrFail(payload.sub).catch(() => null) : null;
    if (!user || !user.isActive || payload.ver !== user.tokenVersion) {
      throw new UnauthorizedException('Session expirée, reconnectez-vous.');
    }
    return this.issue(user);
  }

  async logout({ userId }: LogoutRequest): Promise<{ ok: true }> {
    const user = await this.users.findOrFail(userId);
    user.tokenVersion += 1;
    await this.users.save(user);
    return { ok: true };
  }

  async changePassword(req: ChangePasswordRequest): Promise<{ ok: true }> {
    const user = await this.users.findOrFail(req.userId);
    if (!(await bcrypt.compare(req.currentPassword ?? '', user.passwordHash))) {
      throw new UnauthorizedException('Mot de passe actuel incorrect.');
    }
    user.passwordHash = await bcrypt.hash(req.newPassword, 10);
    await this.users.save(user);
    return { ok: true };
  }

  private issue(user: User): AuthResult {
    const ttl = envInt('JWT_ACCESS_TTL_SECONDS', 900);
    const base = { sub: user.id, role: user.role, email: user.email, name: `${user.firstName} ${user.lastName}` };
    const accessToken = this.jwt.sign({ ...base, type: 'access' } satisfies JwtPayload, {
      secret: env('JWT_ACCESS_SECRET'),
      expiresIn: ttl,
    });
    const refreshToken = this.jwt.sign({ ...base, type: 'refresh', ver: user.tokenVersion } satisfies JwtPayload, {
      secret: env('JWT_REFRESH_SECRET'),
      expiresIn: `${envInt('JWT_REFRESH_TTL_DAYS', 30)}d`,
    });
    return { accessToken, refreshToken, expiresIn: ttl, user: toUserDto(user) };
  }
}
