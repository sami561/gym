import { api } from './client';
import type {
  AccessDecision,
  AccessKey,
  AccessLogDto,
  AuthResult,
  BookingDto,
  BookingPolicy,
  ChangePasswordResult,
  ClassSessionDto,
  CreateBookingRequest,
  CreateMeasurementRequest,
  GymInfo,
  LoginRequest,
  MeasurementDto,
  MemberBookingStanding,
  MemberDoor,
  MemberDto,
  MeResponse,
  OkResult,
  OpenDoorRequest,
  PtSessionDto,
  RegisterRequest,
  UpdateMeRequest,
  UserDto,
  WorkoutProgramDto,
} from './types';

export const authApi = {
  login: (body: LoginRequest) => api<AuthResult>('/auth/login', { method: 'POST', body, auth: false }),
  register: (body: RegisterRequest) =>
    api<AuthResult>('/auth/register', { method: 'POST', body, auth: false }),
  me: () => api<UserDto>('/auth/me'),
  logout: () => api<OkResult>('/auth/logout', { method: 'POST' }),
  /** Ends every other session: keep the returned tokens (AuthProvider.changePassword does). */
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api<ChangePasswordResult>('/auth/password', { method: 'PATCH', body }),
};

export const meApi = {
  get: () => api<MeResponse>('/me'),
  update: (body: UpdateMeRequest) => api<MemberDto>('/me', { method: 'PATCH', body }),
  accessKey: () => api<AccessKey>('/me/access-key'),
  /**
   * New QR secret (lost or shared phone): codes built with the previous key are refused at once.
   * Store the returned key in place of the cached one (STORAGE_KEYS.accessKey, see useAccessKey).
   */
  rotateAccessKey: () => api<AccessKey>('/me/access-key/rotate', { method: 'POST' }),
  doors: () => api<MemberDoor[]>('/me/doors'),
  openDoor: (doorId: string, body: OpenDoorRequest) =>
    api<AccessDecision>(`/me/doors/${encodeURIComponent(doorId)}/open`, {
      method: 'POST',
      body,
      timeoutMs: 20_000,
    }),
  visits: (limit = 50) => api<AccessLogDto[]>('/me/visits', { query: { limit } }),
  classes: (from: string, to: string) => api<ClassSessionDto[]>('/me/classes', { query: { from, to } }),
  bookings: (includePast = false) => api<BookingDto[]>('/me/bookings', { query: { includePast } }),
  book: (body: CreateBookingRequest) => api<BookingDto>('/me/bookings', { method: 'POST', body }),
  cancelBooking: (bookingId: string) =>
    api<BookingDto>(`/me/bookings/${encodeURIComponent(bookingId)}`, { method: 'DELETE' }),
  bookingStanding: () => api<MemberBookingStanding>('/me/booking-standing'),
  registerPushToken: (token: string) => api<OkResult>('/me/push-token', { method: 'PUT', body: { token } }),
  programs: () => api<WorkoutProgramDto[]>('/me/programs'),
  measurements: () => api<MeasurementDto[]>('/me/measurements'),
  addMeasurement: (body: CreateMeasurementRequest) =>
    api<MeasurementDto>('/me/measurements', { method: 'POST', body }),
  ptSessions: () => api<PtSessionDto[]>('/me/pt-sessions'),
};

export const publicApi = {
  gym: () => api<GymInfo>('/public/gym', { auth: false }),
  bookingPolicy: () => api<BookingPolicy>('/bookings/policy', { auth: false }),
};
