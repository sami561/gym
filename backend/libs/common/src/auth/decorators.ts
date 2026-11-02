import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthUser, Role } from '../contracts/auth.contracts';
import { Actor } from '../contracts/common.contracts';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const API_KEY_KEY = 'apiKey';

/** Route reachable without a JWT. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Route restricted to the given roles (any authenticated user when omitted). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Route authenticated with the x-api-key header (n8n automations) instead of a JWT. */
export const ApiKeyAuth = () => SetMetadata(API_KEY_KEY, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export function toActor(user: AuthUser): Actor {
  return { id: user.id, role: user.role, name: user.name };
}
