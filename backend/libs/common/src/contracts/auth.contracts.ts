export enum Role {
  ADMIN = 'ADMIN',
  STAFF = 'STAFF',
  COACH = 'COACH',
  MEMBER = 'MEMBER',
}

export const STAFF_ROLES: Role[] = [Role.ADMIN, Role.STAFF];

export interface UserDto {
  id: string;
  email: string;
  phone: string | null;
  role: Role;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  specialty: string | null;
  bio: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  user: UserDto;
}

export interface JwtPayload {
  sub: string;
  role: Role;
  email: string;
  name: string;
  type: 'access' | 'refresh';
  /** Refresh tokens only: must match the user's tokenVersion. */
  ver?: number;
}

/** The authenticated caller as seen by the gateway (req.user). */
export interface AuthUser {
  id: string;
  role: Role;
  email: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  userId: string;
}

export interface ChangePasswordRequest {
  userId: string;
  currentPassword: string;
  newPassword: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  role: Role;
  firstName: string;
  lastName: string;
  phone?: string | null;
  specialty?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
}

export interface UpdateUserRequest {
  id: string;
  data: {
    email?: string;
    password?: string;
    role?: Role;
    firstName?: string;
    lastName?: string;
    phone?: string | null;
    specialty?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
    isActive?: boolean;
  };
}

export interface ListUsersRequest {
  role?: Role;
  search?: string;
}

export interface GetManyUsersRequest {
  ids: string[];
}

export interface PublicCoach {
  id: string;
  firstName: string;
  lastName: string;
  specialty: string | null;
  bio: string | null;
  avatarUrl: string | null;
}
