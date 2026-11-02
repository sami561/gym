import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  AuthResult,
  ChangePasswordRequest,
  ChangePasswordResult,
  JwtPayload,
  LoginRequest,
  LogoutRequest,
  RefreshRequest,
  env,
  envInt,
} from '@app/common';
import { RefreshSession } from '../sessions/refresh-session.entity';
import { RefreshClaims, refreshClaims } from '../sessions/refresh-rotation';
import { RefreshSessionsService, SESSION_EXPIRED, refreshTtlSeconds } from '../sessions/refresh-sessions.service';
import { hashPassword, verifyPassword } from '../users/passwords';
import { User } from '../users/user.entity';
import { toUserDto, UsersService } from '../users/users.service';

const ACCOUNT_DISABLED = 'Ce compte est désactivé. Contactez l’accueil.';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: RefreshSessionsService,
    private readonly jwt: JwtService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async login({ email, password }: LoginRequest): Promise<AuthResult> {
    const user = await this.users.findByEmail(email ?? '');
    // bcrypt runs for unknown e-mails too, so the response time does not reveal which accounts exist.
    const valid = await verifyPassword(password ?? '', user?.passwordHash);
    if (!user || !valid) throw new UnauthorizedException('E-mail ou mot de passe incorrect.');
    if (!user.isActive) throw new ForbiddenException(ACCOUNT_DISABLED);
    user.lastLoginAt = new Date();
    // Only this column: saving the row read before bcrypt would write back a deactivation, demotion
    // or password change committed meanwhile.
    await this.users.recordLogin(user.id, user.lastLoginAt);
    return this.issue(user, await this.sessions.open(user.id));
  }

  /** Refresh tokens are single-use: RefreshSessionsService.use rotates them and detects replays. */
  async refresh({ refreshToken }: RefreshRequest): Promise<AuthResult> {
    const claims = this.verifyRefreshToken(refreshToken);
    const user = await this.users.findOrFail(claims.sub).catch(() => null);
    if (!user || !user.isActive || claims.ver !== user.tokenVersion) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }
    return this.issue(user, await this.sessions.use(claims));
  }

  /** Every device: refresh tokens carry the previous version and every login family is closed. */
  async logout({ userId }: LogoutRequest): Promise<{ ok: true }> {
    const user = await this.users.findOrFail(userId);
    await this.dataSource.transaction(async (manager) => {
      await manager.increment(User, { id: user.id }, 'tokenVersion', 1);
      await this.sessions.revokeAll(user.id, manager);
    });
    return { ok: true };
  }

  /** Ends every session of the user, then opens a fresh one so the caller stays signed in on this device. */
  async changePassword(req: ChangePasswordRequest): Promise<ChangePasswordResult> {
    const current = await this.users.findOrFail(req.userId);
    if (!current.isActive) throw new ForbiddenException(ACCOUNT_DISABLED);
    if (!(await verifyPassword(req.currentPassword ?? '', current.passwordHash))) {
      throw new UnauthorizedException('Mot de passe actuel incorrect.');
    }
    const passwordHash = await hashPassword(req.newPassword);
    const { user, family } = await this.dataSource.transaction(async (manager) => {
      // Row lock: a logout or a staff change of this user cannot interleave with the version bump.
      const user = await manager.findOne(User, { where: { id: current.id }, lock: { mode: 'pessimistic_write' } });
      if (!user) throw new NotFoundException('Utilisateur introuvable.');
      // Again under the lock: a deactivation or another password change may have landed during bcrypt.
      if (!user.isActive) throw new ForbiddenException(ACCOUNT_DISABLED);
      if (user.passwordHash !== current.passwordHash) throw new UnauthorizedException('Mot de passe actuel incorrect.');
      user.passwordHash = passwordHash;
      user.tokenVersion += 1;
      await manager.save(user);
      await this.sessions.revokeAll(user.id, manager);
      return { user, family: await this.sessions.open(user.id, manager) };
    });
    return { ...this.issue(user, family), ok: true };
  }

  /** Signature, expiry and claims of a refresh token; tokens signed before rotation existed are refused. */
  private verifyRefreshToken(token: string | undefined): RefreshClaims {
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(token ?? '', { secret: env('JWT_REFRESH_SECRET') });
    } catch {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }
    const claims = refreshClaims(payload);
    if (!claims) throw new UnauthorizedException(SESSION_EXPIRED);
    return claims;
  }

  private issue(user: User, family: RefreshSession): AuthResult {
    const ttl = envInt('JWT_ACCESS_TTL_SECONDS', 900);
    const base = { sub: user.id, role: user.role, email: user.email, name: `${user.firstName} ${user.lastName}` };
    const accessToken = this.jwt.sign({ ...base, type: 'access' } satisfies JwtPayload, {
      secret: env('JWT_ACCESS_SECRET'),
      expiresIn: ttl,
    });
    const refreshToken = this.jwt.sign(
      { ...base, type: 'refresh', ver: user.tokenVersion, fam: family.id, jti: family.currentJti } satisfies JwtPayload,
      { secret: env('JWT_REFRESH_SECRET'), expiresIn: refreshTtlSeconds() },
    );
    return { accessToken, refreshToken, expiresIn: ttl, user: toUserDto(user) };
  }
}
