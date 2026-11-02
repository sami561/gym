import { api } from './client';
import type { CreateMemberResult, OkResult, PaymentMethod, Role } from './types';
import type {
  AttendanceDto,
  ConvertLeadBody,
  CreateProgramBody,
  CreateSaleBody,
  CreateTaskBody,
  CreateWorkflowBody,
  EmployeeDto,
  EquipmentDto,
  ExerciseDto,
  ExpenseDto,
  FinanceKpis,
  FinanceSummary,
  LeadActivityDto,
  LeadActivityType,
  LeadDto,
  LeadSource,
  LeadStatus,
  LeaveDto,
  LockerDto,
  MaintenanceTicketDto,
  MeasurementDto,
  MembersAnalytics,
  OperationsSummary,
  PayrollDto,
  ProductDto,
  PromoCodeDto,
  PromoQuote,
  PtSessionDto,
  SaleDto,
  SalesPage,
  ShiftDto,
  StockMovementDto,
  TaskDto,
  TaskStatus,
  TeamOverview,
  UpdateTaskBody,
  WorkflowDto,
  WorkflowMeta,
  WorkflowRunDto,
  WorkflowRunStatus,
  WorkoutProgramDto,
} from './types-ops';
import type { RoomDto } from './types';

type Body = Record<string, unknown>;

const crud = <T>(base: string) => ({
  create: (body: Body) => api<T>(base, { method: 'POST', body }),
  update: (id: string, body: Body) => api<T>(`${base}/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api<OkResult>(`${base}/${id}`, { method: 'DELETE' }),
});

// ---------- CRM & promos ----------
export const leadsApi = {
  list: (params: { status?: LeadStatus | ''; source?: LeadSource | ''; search?: string; dueOnly?: boolean } = {}) =>
    api<LeadDto[]>('/api/leads', { query: { ...params, dueOnly: params.dueOnly || undefined } }),
  get: (id: string) => api<LeadDto>(`/api/leads/${id}`),
  ...crud<LeadDto>('/api/leads'),
  addActivity: (id: string, type: LeadActivityType, note?: string) =>
    api<LeadActivityDto>(`/api/leads/${id}/activities`, { method: 'POST', body: { type, note } }),
  convert: (id: string, body: ConvertLeadBody) =>
    api<CreateMemberResult>(`/api/leads/${id}/convert`, { method: 'POST', body }),
};

export const promosApi = {
  list: () => api<PromoCodeDto[]>('/api/promos'),
  ...crud<PromoCodeDto>('/api/promos'),
  check: (code: string, planId: string) =>
    api<PromoQuote>('/api/promos/check', { method: 'POST', body: { code, planId } }),
};

// ---------- staff / HR ----------
export const employeesApi = {
  list: (params: { search?: string; position?: string; status?: string } = {}) =>
    api<EmployeeDto[]>('/api/employees', { query: params }),
  ...crud<EmployeeDto>('/api/employees'),
};

export const shiftsApi = {
  list: (from: string, to: string, employeeId?: string) =>
    api<ShiftDto[]>('/api/shifts', { query: { from, to, employeeId } }),
  create: (body: Body) => api<ShiftDto[]>('/api/shifts', { method: 'POST', body }),
  update: (id: string, body: Body) => api<ShiftDto>(`/api/shifts/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api<OkResult>(`/api/shifts/${id}`, { method: 'DELETE' }),
};

export const attendanceApi = {
  list: (params: { from?: string; to?: string; employeeId?: string } = {}) =>
    api<AttendanceDto[]>('/api/attendance', { query: params }),
  clockIn: (employeeId: string) =>
    api<AttendanceDto>('/api/attendance/clock-in', { method: 'POST', body: { employeeId, source: 'KIOSK' } }),
  clockOut: (employeeId: string) =>
    api<AttendanceDto>('/api/attendance/clock-out', { method: 'POST', body: { employeeId, source: 'KIOSK' } }),
};

export const leavesApi = {
  list: (params: { status?: string; employeeId?: string } = {}) => api<LeaveDto[]>('/api/leaves', { query: params }),
  create: (body: Body) => api<LeaveDto>('/api/leaves', { method: 'POST', body }),
  decide: (id: string, status: 'APPROVED' | 'REJECTED') =>
    api<LeaveDto>(`/api/leaves/${id}/decision`, { method: 'POST', body: { status } }),
  remove: (id: string) => api<OkResult>(`/api/leaves/${id}`, { method: 'DELETE' }),
};

export const payrollApi = {
  list: (period?: string) => api<PayrollDto[]>('/api/payroll', { query: { period } }),
  generate: (period?: string) => api<PayrollDto[]>('/api/payroll/generate', { method: 'POST', body: { period } }),
  update: (id: string, body: Body) => api<PayrollDto>(`/api/payroll/${id}`, { method: 'PATCH', body }),
  pay: (id: string, method: PaymentMethod) =>
    api<PayrollDto>(`/api/payroll/${id}/pay`, { method: 'POST', body: { method } }),
};

// ---------- facility ----------
export const roomsApi = {
  list: () => api<RoomDto[]>('/api/rooms'),
  ...crud<RoomDto>('/api/rooms'),
};

export const equipmentApi = {
  list: (params: { roomId?: string; status?: string; category?: string; search?: string; dueWithinDays?: number } = {}) =>
    api<EquipmentDto[]>('/api/equipment', { query: params }),
  ...crud<EquipmentDto>('/api/equipment'),
};

export const maintenanceApi = {
  list: (params: { status?: string; equipmentId?: string; roomId?: string } = {}) =>
    api<MaintenanceTicketDto[]>('/api/maintenance', { query: params }),
  create: (body: Body) => api<MaintenanceTicketDto>('/api/maintenance', { method: 'POST', body }),
  update: (id: string, body: Body) => api<MaintenanceTicketDto>(`/api/maintenance/${id}`, { method: 'PATCH', body }),
};

export const lockersApi = {
  list: (params: { roomId?: string; status?: string } = {}) => api<LockerDto[]>('/api/lockers', { query: params }),
  createRange: (body: { roomId?: string | null; prefix?: string; from: number; to: number }) =>
    api<LockerDto[]>('/api/lockers', { method: 'POST', body }),
  assign: (id: string, body: Body) => api<LockerDto>(`/api/lockers/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api<OkResult>(`/api/lockers/${id}`, { method: 'DELETE' }),
};

// ---------- shop, stock, expenses, finance ----------
export const productsApi = {
  list: (params: { search?: string; category?: string; includeInactive?: boolean; lowStockOnly?: boolean } = {}) =>
    api<ProductDto[]>('/api/products', { query: params }),
  ...crud<ProductDto>('/api/products'),
};

export const stockApi = {
  movements: (productId?: string, limit = 100) =>
    api<StockMovementDto[]>('/api/stock/movements', { query: { productId, limit } }),
  move: (body: { productId: string; type: 'IN' | 'OUT' | 'ADJUSTMENT'; quantity: number; unitCost?: number | null; reason?: string | null }) =>
    api<StockMovementDto>('/api/stock/movements', { method: 'POST', body }),
};

export const salesApi = {
  list: (params: { from?: string; to?: string; memberId?: string; page?: number; pageSize?: number } = {}) =>
    api<SalesPage>('/api/sales', { query: params }),
  create: (body: CreateSaleBody) => api<SaleDto>('/api/sales', { method: 'POST', body }),
  refund: (id: string) => api<SaleDto>(`/api/sales/${id}/refund`, { method: 'POST' }),
};

export const expensesApi = {
  list: (params: { from?: string; to?: string; category?: string } = {}) =>
    api<ExpenseDto[]>('/api/expenses', { query: params }),
  ...crud<ExpenseDto>('/api/expenses'),
};

export const financeApi = {
  summary: (months = 12) => api<FinanceSummary>('/api/finance/summary', { query: { months } }),
};

// ---------- training ----------
export const exercisesApi = {
  list: () => api<ExerciseDto[]>('/api/exercises'),
  ...crud<ExerciseDto>('/api/exercises'),
};

export const programsApi = {
  list: (params: { memberId?: string; coachId?: string; activeOnly?: boolean } = {}) =>
    api<WorkoutProgramDto[]>('/api/programs', { query: params }),
  get: (id: string) => api<WorkoutProgramDto>(`/api/programs/${id}`),
  create: (body: CreateProgramBody) => api<WorkoutProgramDto>('/api/programs', { method: 'POST', body }),
  update: (id: string, body: Partial<CreateProgramBody> & { isActive?: boolean }) =>
    api<WorkoutProgramDto>(`/api/programs/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api<OkResult>(`/api/programs/${id}`, { method: 'DELETE' }),
};

export const measurementsApi = {
  list: (memberId: string) => api<MeasurementDto[]>(`/api/members/${memberId}/measurements`),
  create: (memberId: string, body: Body) =>
    api<MeasurementDto>(`/api/members/${memberId}/measurements`, { method: 'POST', body }),
  remove: (id: string) => api<OkResult>(`/api/measurements/${id}`, { method: 'DELETE' }),
};

export const ptApi = {
  list: (params: { from?: string; to?: string; coachId?: string; memberId?: string } = {}) =>
    api<PtSessionDto[]>('/api/pt-sessions', { query: params }),
  create: (body: Body) => api<PtSessionDto>('/api/pt-sessions', { method: 'POST', body }),
  update: (id: string, body: Body) => api<PtSessionDto>(`/api/pt-sessions/${id}`, { method: 'PATCH', body }),
};

// ---------- workflows & tasks ----------
export const workflowsApi = {
  list: () => api<WorkflowDto[]>('/api/workflows'),
  meta: () => api<WorkflowMeta>('/api/workflows/meta'),
  get: (id: string) => api<WorkflowDto>(`/api/workflows/${id}`),
  create: (body: CreateWorkflowBody) => api<WorkflowDto>('/api/workflows', { method: 'POST', body }),
  update: (id: string, body: Partial<CreateWorkflowBody>) =>
    api<WorkflowDto>(`/api/workflows/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api<OkResult>(`/api/workflows/${id}`, { method: 'DELETE' }),
  start: (id: string, body: { title?: string; context?: Record<string, unknown> } = {}) =>
    api<WorkflowRunDto>(`/api/workflows/${id}/start`, { method: 'POST', body }),
};

export const runsApi = {
  list: (params: { workflowId?: string; status?: WorkflowRunStatus | ''; limit?: number } = {}) =>
    api<WorkflowRunDto[]>('/api/workflow-runs', { query: params }),
  get: (id: string) => api<WorkflowRunDto>(`/api/workflow-runs/${id}`),
  cancel: (id: string) => api<WorkflowRunDto>(`/api/workflow-runs/${id}/cancel`, { method: 'POST' }),
};

export const tasksApi = {
  list: (
    params: {
      status?: TaskStatus | 'OPEN' | '';
      runId?: string;
      assigneeRole?: Role | '';
      overdueOnly?: boolean;
      mine?: boolean;
    } = {},
  ) =>
    api<TaskDto[]>('/api/tasks', {
      query: { ...params, overdueOnly: params.overdueOnly || undefined, mine: params.mine || undefined },
    }),
  create: (body: CreateTaskBody) => api<TaskDto>('/api/tasks', { method: 'POST', body }),
  update: (id: string, body: UpdateTaskBody) => api<TaskDto>(`/api/tasks/${id}`, { method: 'PATCH', body }),
  retry: (id: string) => api<TaskDto>(`/api/tasks/${id}/retry`, { method: 'POST' }),
  remove: (id: string) => api<OkResult>(`/api/tasks/${id}`, { method: 'DELETE' }),
};

export const operationsApi = {
  summary: () => api<OperationsSummary>('/api/dashboard/operations'),
  membersAnalytics: () => api<MembersAnalytics>('/api/dashboard/members-analytics'),
  team: (date?: string) => api<TeamOverview>('/api/dashboard/team', { query: { date } }),
  kpis: (from?: string, to?: string) => api<FinanceKpis>('/api/dashboard/kpis', { query: { from, to } }),
};
