import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload, Role } from '../contracts/auth.contracts';
import { AuthGuard } from './auth.guard';
import { ApiKeyAuth, Public, Roles } from './decorators';

jest.mock('dotenv', () => ({ config: jest.fn() }));

const ACCESS_SECRET = 'spec-access-secret-0123456789abcdef0123456789';
const API_KEY = 'spec-automation-key-0123456789abcdef0123';

@Roles(Role.ADMIN, Role.STAFF)
class StaffController {
  list() {}
  @Roles(Role.COACH)
  coachOnly() {}
  @Public()
  plans() {}
  @ApiKeyAuth()
  automation() {}
}

class AnyUserController {
  me() {}
}

function context(
  controller: { prototype: object },
  handler: string,
  headers: Record<string, string> = {},
  type = 'http',
): { ctx: ExecutionContext; request: { headers: Record<string, string>; user?: unknown } } {
  const request: { headers: Record<string, string>; user?: unknown } = { headers };
  const ctx = {
    getType: () => type,
    getHandler: () => (controller.prototype as Record<string, unknown>)[handler],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
}

describe('AuthGuard (gateway: JWT, roles, @Public, @ApiKeyAuth)', () => {
  const jwt = new JwtService();
  const guard = new AuthGuard(new Reflector(), jwt);
  const saved = { access: process.env.JWT_ACCESS_SECRET, key: process.env.AUTOMATION_API_KEY };

  const token = (claims: Partial<JwtPayload> = {}, options: { secret?: string; expiresIn?: number } = {}) =>
    jwt.sign(
      { sub: 'u-1', role: Role.STAFF, email: 'staff@example.com', name: 'Sami Staff', type: 'access', ...claims },
      { secret: options.secret ?? ACCESS_SECRET, expiresIn: options.expiresIn ?? 900 },
    );
  const bearer = (value: string) => ({ authorization: `Bearer ${value}` });

  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = ACCESS_SECRET;
    process.env.AUTOMATION_API_KEY = API_KEY;
  });
  afterAll(() => {
    if (saved.access === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = saved.access;
    if (saved.key === undefined) delete process.env.AUTOMATION_API_KEY;
    else process.env.AUTOMATION_API_KEY = saved.key;
  });

  it('lets bus events through (only HTTP comes from users)', () => {
    expect(guard.canActivate(context(StaffController, 'list', {}, 'rpc').ctx)).toBe(true);
  });

  it('opens @Public routes without a token', () => {
    expect(guard.canActivate(context(StaffController, 'plans').ctx)).toBe(true);
  });

  it('requires a bearer token', () => {
    expect(() => guard.canActivate(context(AnyUserController, 'me').ctx)).toThrow(
      new UnauthorizedException('Authentification requise.'),
    );
    expect(() => guard.canActivate(context(AnyUserController, 'me', { authorization: `Basic ${token()}` }).ctx)).toThrow(
      'Authentification requise.',
    );
  });

  it('refuses expired tokens and tokens signed with another secret', () => {
    const expired = token({}, { expiresIn: -10 });
    const forged = token({ role: Role.ADMIN }, { secret: 'another-secret-0123456789abcdef0123456789' });
    for (const value of [expired, forged, 'not-a-jwt']) {
      expect(() => guard.canActivate(context(AnyUserController, 'me', bearer(value)).ctx)).toThrow(
        new UnauthorizedException('Session expirée, reconnectez-vous.'),
      );
    }
  });

  it('refuses a refresh token used as an access token', () => {
    expect(() => guard.canActivate(context(AnyUserController, 'me', bearer(token({ type: 'refresh' }))).ctx)).toThrow(
      new UnauthorizedException('Jeton invalide.'),
    );
  });

  it('puts only the identity claims on request.user', () => {
    const { ctx, request } = context(AnyUserController, 'me', bearer(token({ jti: 'should-not-leak' })));
    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.user).toEqual({ id: 'u-1', role: Role.STAFF, email: 'staff@example.com', name: 'Sami Staff' });
  });

  it('applies class roles, and handler roles over class roles', () => {
    expect(guard.canActivate(context(StaffController, 'list', bearer(token())).ctx)).toBe(true);
    expect(() => guard.canActivate(context(StaffController, 'list', bearer(token({ role: Role.MEMBER }))).ctx)).toThrow(
      new ForbiddenException('Accès refusé.'),
    );
    expect(guard.canActivate(context(StaffController, 'coachOnly', bearer(token({ role: Role.COACH }))).ctx)).toBe(true);
    expect(() => guard.canActivate(context(StaffController, 'coachOnly', bearer(token({ role: Role.ADMIN }))).ctx)).toThrow(
      'Accès refusé.',
    );
  });

  describe('@ApiKeyAuth', () => {
    it('accepts the automation key instead of a JWT', () => {
      expect(guard.canActivate(context(StaffController, 'automation', { 'x-api-key': API_KEY }).ctx)).toBe(true);
    });

    it('refuses a wrong key, a missing key or a user token', () => {
      const attempts: Record<string, string>[] = [
        { 'x-api-key': `${API_KEY.slice(0, -1)}x` },
        { 'x-api-key': 'short' },
        {},
        bearer(token()),
      ];
      for (const headers of attempts) {
        expect(() => guard.canActivate(context(StaffController, 'automation', headers).ctx)).toThrow(
          new UnauthorizedException('Clé API invalide.'),
        );
      }
    });

    it('refuses everyone while AUTOMATION_API_KEY is not set', () => {
      process.env.AUTOMATION_API_KEY = '';
      expect(() => guard.canActivate(context(StaffController, 'automation', { 'x-api-key': '' }).ctx)).toThrow(
        'Clé API invalide.',
      );
    });
  });
});
