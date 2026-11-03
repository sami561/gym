import { api, apiBlob, session } from './client';
import type {
  AccessDecision,
  AccessLogDto,
  AccessResult,
  AgentDto,
  AuthResult,
  BookingDto,
  BookingStatus,
  CheckinStats,
  ClassSessionDto,
  CreateAgentResult,
  CreateClassRequest,
  CreateDoorRequest,
  CreateMemberRequest,
  CreateMemberResult,
  CreatePaymentBody,
  CreatePlanRequest,
  CreateSubscriptionBody,
  CreateUserRequest,
  DashboardSummary,
  DoorDto,
  ExpiringItem,
  FreezeSubscriptionBody,
  GymInfo,
  HealthResponse,
  MemberAccessInfo,
  MemberDetail,
  MemberDto,
  MemberListItem,
  MemberStatusFilter,
  OkResult,
  Paginated,
  PaymentDto,
  PaymentMethod,
  PaymentsPage,
  PlanDto,
  PlanMixItem,
  PublicCoach,
  PublicTrialRequest,
  RevenuePoint,
  RoomDto,
  Role,
  SubscriptionDto,
  UpdateClassData,
  UpdateMemberData,
  UpdateSubscriptionBody,
  UpdateUserData,
  UserDto,
} from './types';

// ---------- public ----------
export const publicApi = {
  gym: () => api<GymInfo>('/api/public/gym', { auth: false }),
  plans: () => api<PlanDto[]>('/api/public/plans', { auth: false }),
  classes: (from?: string, to?: string) =>
    api<ClassSessionDto[]>('/api/public/classes', { auth: false, query: { from, to } }),
  coaches: () => api<PublicCoach[]>('/api/public/coaches', { auth: false }),
  rooms: () => api<RoomDto[]>('/api/public/rooms', { auth: false }),
  trial: (body: PublicTrialRequest) =>
    api<OkResult>('/api/public/trial', { method: 'POST', auth: false, body }),
  health: () => api<HealthResponse>('/api/health', { auth: false }),
};

// ---------- auth ----------
export const authApi = {
  login: (email: string, password: string) =>
    api<AuthResult>('/api/auth/login', { method: 'POST', auth: false, body: { email, password } }),
  logout: () => api<OkResult>('/api/auth/logout', { method: 'POST' }),
  me: () => api<UserDto>('/api/auth/me'),
  /** Signs out every other session: keep the fresh tokens returned for this one. */
  changePassword: async (currentPassword: string, newPassword: string) => {
    const result = await api<AuthResult & { ok: true }>('/api/auth/password', { method: 'PATCH', body: { currentPassword, newPassword } });
    if (result?.accessToken && result.refreshToken) session.set(result);
    return result;
  },
};

// ---------- members ----------
export interface MemberListParams {
  search?: string;
  status?: MemberStatusFilter;
  page?: number;
  pageSize?: number;
}

export const membersApi = {
  list: (params: MemberListParams) =>
    api<Paginated<MemberListItem>>('/api/members', { query: { ...params } }),
  create: (body: CreateMemberRequest) =>
    api<CreateMemberResult>('/api/members', { method: 'POST', body }),
  get: (id: string) => api<MemberDetail>(`/api/members/${id}`),
  update: (id: string, data: UpdateMemberData) =>
    api<MemberDto>(`/api/members/${id}`, { method: 'PATCH', body: data }),
  remove: (id: string) => api<OkResult>(`/api/members/${id}`, { method: 'DELETE' }),
  subscribe: (id: string, body: CreateSubscriptionBody) =>
    api<SubscriptionDto>(`/api/members/${id}/subscriptions`, { method: 'POST', body }),
  addPayment: (id: string, body: CreatePaymentBody) =>
    api<PaymentDto>(`/api/members/${id}/payments`, { method: 'POST', body }),
  setCard: (id: string, cardNumber: string | null) =>
    api<MemberAccessInfo>(`/api/members/${id}/card`, { method: 'PUT', body: { cardNumber } }),
  rotateAccessKey: (id: string) =>
    api<{ ok: true; rotatedAt: string }>(`/api/members/${id}/access-key/rotate`, { method: 'POST' }),
  /** JPEG blob; `version` = Date.parse(photoUpdatedAt) makes the answer immutable. 404 = no photo. */
  photo: (id: string, version?: number, signal?: AbortSignal) =>
    apiBlob(`/api/members/${id}/photo`, { query: { v: version }, signal }),
  /** A JPEG ≤ 512 KB prepared by src/lib/photo.ts, sent as the multipart field `photo`. */
  setPhoto: (id: string, photo: Blob) => {
    const form = new FormData();
    form.append('photo', photo, 'photo.jpg');
    return api<MemberDto>(`/api/members/${id}/photo`, { method: 'PUT', body: form });
  },
  removePhoto: (id: string) => api<MemberDto>(`/api/members/${id}/photo`, { method: 'DELETE' }),
};

export const subscriptionsApi = {
  update: (id: string, body: UpdateSubscriptionBody) =>
    api<SubscriptionDto>(`/api/subscriptions/${id}`, { method: 'PATCH', body }),
  freeze: (id: string, body: FreezeSubscriptionBody) =>
    api<SubscriptionDto>(`/api/subscriptions/${id}/freeze`, { method: 'POST', body }),
  unfreeze: (id: string) =>
    api<SubscriptionDto>(`/api/subscriptions/${id}/unfreeze`, { method: 'POST' }),
};

// ---------- payments ----------
export interface PaymentListParams {
  from?: string;
  to?: string;
  method?: PaymentMethod | '';
  memberId?: string;
  page?: number;
  pageSize?: number;
}

export const paymentsApi = {
  list: (params: PaymentListParams) => api<PaymentsPage>('/api/payments', { query: { ...params } }),
};

// ---------- plans ----------
export const plansApi = {
  list: (includeInactive = true) => api<PlanDto[]>('/api/plans', { query: { includeInactive } }),
  create: (body: CreatePlanRequest) => api<PlanDto>('/api/plans', { method: 'POST', body }),
  update: (id: string, body: Partial<CreatePlanRequest>) =>
    api<PlanDto>(`/api/plans/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api<OkResult>(`/api/plans/${id}`, { method: 'DELETE' }),
};

// ---------- classes ----------
export const classesApi = {
  list: (from: string, to: string) => api<ClassSessionDto[]>('/api/classes', { query: { from, to } }),
  create: (body: CreateClassRequest) =>
    api<ClassSessionDto[]>('/api/classes', { method: 'POST', body }),
  update: (id: string, data: UpdateClassData) =>
    api<ClassSessionDto>(`/api/classes/${id}`, { method: 'PATCH', body: data }),
  remove: (id: string) => api<OkResult>(`/api/classes/${id}`, { method: 'DELETE' }),
  bookings: (id: string) => api<BookingDto[]>(`/api/classes/${id}/bookings`),
  setBookingStatus: (bookingId: string, status: BookingStatus) =>
    api<BookingDto>(`/api/bookings/${bookingId}`, { method: 'PATCH', body: { status } }),
};

// ---------- users ----------
export const usersApi = {
  list: (role?: Role, search?: string) => api<UserDto[]>('/api/users', { query: { role, search } }),
  create: (body: CreateUserRequest) => api<UserDto>('/api/users', { method: 'POST', body }),
  update: (id: string, data: UpdateUserData) =>
    api<UserDto>(`/api/users/${id}`, { method: 'PATCH', body: data }),
  remove: (id: string) => api<OkResult>(`/api/users/${id}`, { method: 'DELETE' }),
};

// ---------- access ----------
export interface LogParams {
  limit?: number;
  doorId?: string;
  memberId?: string;
  result?: AccessResult | '';
  before?: string;
}

export const accessApi = {
  logs: (params: LogParams = {}) => api<AccessLogDto[]>('/api/access/logs', { query: { ...params } }),
  scan: (code: string, doorId: string) =>
    api<AccessDecision>('/api/access/scan', { method: 'POST', body: { code, doorId } }),
  doors: () => api<DoorDto[]>('/api/doors'),
  createDoor: (body: CreateDoorRequest) => api<DoorDto>('/api/doors', { method: 'POST', body }),
  updateDoor: (id: string, body: Partial<CreateDoorRequest>) =>
    api<DoorDto>(`/api/doors/${id}`, { method: 'PATCH', body }),
  removeDoor: (id: string) => api<OkResult>(`/api/doors/${id}`, { method: 'DELETE' }),
  openDoor: (id: string, reason?: string) =>
    api<AccessDecision>(`/api/doors/${id}/open`, { method: 'POST', body: { reason } }),
  agents: () => api<AgentDto[]>('/api/agents'),
  createAgent: (name: string) => api<CreateAgentResult>('/api/agents', { method: 'POST', body: { name } }),
  removeAgent: (id: string) => api<OkResult>(`/api/agents/${id}`, { method: 'DELETE' }),
};

// ---------- dashboard ----------
export const dashboardApi = {
  summary: () => api<DashboardSummary>('/api/dashboard/summary'),
  revenue: (months = 12) => api<RevenuePoint[]>('/api/dashboard/revenue', { query: { months } }),
  checkins: (days = 30) => api<CheckinStats>('/api/dashboard/checkins', { query: { days } }),
  expiring: (days = 7) => api<ExpiringItem[]>('/api/dashboard/expiring', { query: { days } }),
  planMix: () => api<PlanMixItem[]>('/api/dashboard/plan-mix'),
};
