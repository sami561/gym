import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'crypto';
import { env } from '../config/env';
import { AuthUser, JwtPayload, Role } from '../contracts/auth.contracts';
import { API_KEY_KEY, IS_PUBLIC_KEY, ROLES_KEY } from './decorators';

/**
 * Global guard of the API gateway: verifies the access token (stateless JWT),
 * then the @Roles() requirement. @Public() and @ApiKeyAuth() routes are handled here too.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Only HTTP requests come from users; bus events (the gateway's live feed listener)
    // come from our own services on the internal network.
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest();

    if (this.reflector.getAllAndOverride<boolean>(API_KEY_KEY, targets)) {
      const provided = String(request.headers['x-api-key'] ?? '');
      const expected = env('AUTOMATION_API_KEY', '');
      if (!expected || !safeEqual(provided, expected)) throw new UnauthorizedException('Clé API invalide.');
      return true;
    }

    const header = String(request.headers.authorization ?? '');
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new UnauthorizedException('Authentification requise.');

    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(token, { secret: env('JWT_ACCESS_SECRET') });
    } catch {
      throw new UnauthorizedException('Session expirée, reconnectez-vous.');
    }
    if (payload.type !== 'access') throw new UnauthorizedException('Jeton invalide.');

    const user: AuthUser = { id: payload.sub, role: payload.role, email: payload.email, name: payload.name };
    request.user = user;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (roles?.length && !roles.includes(user.role)) throw new ForbiddenException('Accès refusé.');
    return true;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
