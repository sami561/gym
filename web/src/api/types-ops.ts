/**
 * Mirror of the "Gym operations (v2)" and "Workflows & tasks (v3)" contracts:
 * backend/libs/common/src/contracts/{staff,facility,commerce,training,workflow}.contracts.ts
 * and the freeze / promo / leads part of membership.contracts.ts.
 */
import type { PaymentInput, PaymentMethod, Role } from './types';

// ---------- staff / HR ----------
export type EmployeePosition = 'MANAGER' | 'RECEPTION' | 'COACH' | 'CLEANING' | 'MAINTENANCE' | 'OTHER';
export type ContractType = 'CDI' | 'CDD' | 'FREELANCE' | 'STAGE';
export type SalaryType = 'MONTHLY' | 'HOURLY' | 'PER_SESSION';
export type EmployeeStatus = 'ACTIVE' | 'INACTIVE';
export type LeaveType = 'ANNUAL' | 'SICK' | 'UNPAID' | 'OTHER';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type PayrollStatus = 'DRAFT' | 'PAID';

export interface EmployeeDto {
  id: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  position: EmployeePosition;
  contractType: ContractType;
  hireDate: string;
  endDate: string | null;
  salaryType: SalaryType;
  baseSalary: number;
  commissionRate: number;
  cin: string | null;
  cnssNumber: string | null;
  rib: string | null;
  status: EmployeeStatus;
  notes: string | null;
  createdAt: string;
}

export interface ShiftDto {
  id: string;
  employeeId: string;
  employeeName: string;
  startsAt: string;
  endsAt: string;
  task: string | null;
  roomName: string | null;
}

export interface AttendanceDto {
  id: string;
  employeeId: string;
  employeeName: string;
  clockIn: string;
  clockOut: string | null;
  minutes: number | null;
  lateMinutes: number | null;
  source: 'MANUAL' | 'DEVICE' | 'KIOSK';
}

export interface LeaveDto {
  id: string;
  employeeId: string;
  employeeName: string;
  type: LeaveType;
  from: string;
  to: string;
  days: number;
  status: LeaveStatus;
  reason: string | null;
  decidedByName: string | null;
  createdAt: string;
}

export interface PayrollDto {
  id: string;
  employeeId: string;
  employeeName: string;
  period: string;
  baseAmount: number;
  hoursWorked: number;
  sessions: number;
  commissions: number;
  bonuses: number;
  deductions: number;
  netAmount: number;
  status: PayrollStatus;
  paidAt: string | null;
  method: PaymentMethod | null;
  notes: string | null;
}

export interface StaffStats {
  activeEmployees: number;
  presentNow: number;
  pendingLeaves: number;
  payrollThisMonth: number;
}

// ---------- facility ----------
export type EquipmentCategory = 'CARDIO' | 'STRENGTH' | 'FREE_WEIGHTS' | 'ACCESSORY' | 'OTHER';
export type EquipmentStatus = 'OPERATIONAL' | 'MAINTENANCE' | 'OUT_OF_ORDER' | 'RETIRED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
export type LockerStatus = 'FREE' | 'OCCUPIED' | 'OUT_OF_ORDER';

export interface EquipmentDto {
  id: string;
  name: string;
  category: EquipmentCategory;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  roomId: string | null;
  roomName: string | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  warrantyUntil: string | null;
  status: EquipmentStatus;
  maintenanceIntervalDays: number | null;
  lastMaintenanceAt: string | null;
  nextMaintenanceAt: string | null;
  notes: string | null;
}

export interface MaintenanceTicketDto {
  id: string;
  equipmentId: string | null;
  equipmentName: string | null;
  roomId: string | null;
  roomName: string | null;
  title: string;
  description: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  reportedByName: string | null;
  assignedTo: string | null;
  cost: number | null;
  openedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

export interface LockerDto {
  id: string;
  number: string;
  roomId: string | null;
  roomName: string | null;
  status: LockerStatus;
  memberId: string | null;
  memberName: string | null;
  assignedUntil: string | null;
}

export interface FacilityStats {
  rooms: number;
  equipmentTotal: number;
  equipmentOutOfOrder: number;
  maintenanceDue: number;
  openTickets: number;
  urgentTickets: number;
  lockersFree: number;
  lockersOccupied: number;
}

// ---------- commerce ----------
export type ProductCategory = 'SUPPLEMENT' | 'DRINK' | 'SNACK' | 'APPAREL' | 'ACCESSORY' | 'SERVICE';
export type StockMovementType = 'IN' | 'OUT' | 'ADJUSTMENT' | 'SALE' | 'RETURN';
export type SaleStatus = 'COMPLETED' | 'REFUNDED';
export type ExpenseCategory =
  | 'RENT'
  | 'SALARY'
  | 'UTILITIES'
  | 'MAINTENANCE'
  | 'EQUIPMENT'
  | 'MARKETING'
  | 'SUPPLIES'
  | 'TAXES'
  | 'OTHER';

export interface ProductDto {
  id: string;
  name: string;
  sku: string | null;
  category: ProductCategory;
  price: number;
  cost: number | null;
  stock: number | null;
  lowStockThreshold: number;
  isActive: boolean;
  imageUrl: string | null;
  isLowStock: boolean;
}

export interface StockMovementDto {
  id: string;
  productId: string;
  productName: string;
  type: StockMovementType;
  quantity: number;
  unitCost: number | null;
  reason: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface SaleItemDto {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface SaleDto {
  id: string;
  number: string;
  memberId: string | null;
  memberName: string | null;
  items: SaleItemDto[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  soldByName: string | null;
  createdAt: string;
}

export interface CreateSaleBody {
  items: { productId: string; quantity: number }[];
  memberId?: string | null;
  memberName?: string | null;
  memberEmail?: string | null;
  discount?: number;
  paymentMethod: PaymentMethod;
}

export interface SalesPage {
  items: SaleDto[];
  total: number;
  page: number;
  pageSize: number;
  sum: number;
}

export interface ExpenseDto {
  id: string;
  category: ExpenseCategory;
  label: string;
  amount: number;
  date: string;
  paymentMethod: PaymentMethod | null;
  supplier: string | null;
  reference: string | null;
  source: string;
  createdByName: string | null;
  createdAt: string;
}

export interface FinanceMonth {
  month: string;
  membershipRevenue: number;
  salesRevenue: number;
  expenses: number;
  profit: number;
}

export interface FinanceSummary {
  months: FinanceMonth[];
  expensesByCategory: { category: ExpenseCategory; total: number }[];
  thisMonth: FinanceMonth;
}

export interface CommerceStats {
  salesToday: number;
  salesThisMonth: number;
  expensesThisMonth: number;
  lowStockProducts: number;
}

// ---------- training ----------
export type MuscleGroup = 'CHEST' | 'BACK' | 'SHOULDERS' | 'ARMS' | 'LEGS' | 'GLUTES' | 'CORE' | 'CARDIO' | 'FULL_BODY';
export type PtSessionStatus = 'SCHEDULED' | 'DONE' | 'CANCELLED' | 'NO_SHOW';

export interface ExerciseDto {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: string | null;
  description: string | null;
  videoUrl: string | null;
}

export interface ProgramExercise {
  exerciseId: string | null;
  name: string;
  sets: number;
  reps: string;
  restSeconds: number | null;
  weightKg: number | null;
  notes: string | null;
}

export interface ProgramDay {
  label: string;
  exercises: ProgramExercise[];
}

export interface WorkoutProgramDto {
  id: string;
  memberId: string;
  memberName: string;
  coachId: string | null;
  coachName: string | null;
  title: string;
  goal: string | null;
  startDate: string;
  weeks: number;
  days: ProgramDay[];
  isActive: boolean;
  createdAt: string;
}

export interface CreateProgramBody {
  memberId: string;
  coachId?: string | null;
  title: string;
  goal?: string | null;
  startDate: string;
  weeks: number;
  days: ProgramDay[];
}

export interface MeasurementDto {
  id: string;
  memberId: string;
  date: string;
  weightKg: number | null;
  heightCm: number | null;
  bodyFatPct: number | null;
  musclePct: number | null;
  chestCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  bmi: number | null;
  notes: string | null;
  recordedByName: string | null;
}

export interface PtSessionDto {
  id: string;
  coachId: string;
  coachName: string;
  memberId: string;
  memberName: string;
  startsAt: string;
  endsAt: string;
  status: PtSessionStatus;
  price: number;
  notes: string | null;
}

export interface TrainingStats {
  activePrograms: number;
  ptSessionsThisMonth: number;
  ptRevenueThisMonth: number;
}

// ---------- promos & CRM ----------
export type PromoType = 'PERCENT' | 'FIXED';

export interface PromoCodeDto {
  id: string;
  code: string;
  type: PromoType;
  value: number;
  validFrom: string | null;
  validUntil: string | null;
  maxUses: number | null;
  uses: number;
  isActive: boolean;
  description: string | null;
}

export interface PromoQuote {
  code: string;
  planPrice: number;
  discount: number;
  price: number;
}

export type LeadSource = 'WALK_IN' | 'INSTAGRAM' | 'FACEBOOK' | 'WEBSITE' | 'REFERRAL' | 'PHONE' | 'OTHER';
export type LeadStatus = 'NEW' | 'CONTACTED' | 'TRIAL' | 'CONVERTED' | 'LOST';
export type LeadActivityType = 'CALL' | 'MESSAGE' | 'EMAIL' | 'VISIT' | 'NOTE';

export interface LeadActivityDto {
  id: string;
  type: LeadActivityType;
  note: string | null;
  byName: string | null;
  at: string;
}

export interface LeadDto {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  source: LeadSource;
  status: LeadStatus;
  interestPlanId: string | null;
  interestPlanName: string | null;
  trialDate: string | null;
  followUpAt: string | null;
  notes: string | null;
  assignedToName: string | null;
  convertedMemberId: string | null;
  createdAt: string;
  activities?: LeadActivityDto[];
}

export interface ConvertLeadBody {
  password?: string;
  planId?: string;
  payment?: PaymentInput;
}

export interface LeadStats {
  newThisMonth: number;
  trialsThisMonth: number;
  convertedThisMonth: number;
  conversionRate90d: number;
  followUpsDue: number;
}

// ---------- workflows ----------
export type WorkflowTriggerType = 'MANUAL' | 'EVENT' | 'SCHEDULE';
export type TaskType = 'MANUAL' | 'AUTOMATION';
export type TaskStatus = 'BLOCKED' | 'TODO' | 'IN_PROGRESS' | 'DONE' | 'SKIPPED' | 'FAILED';
export type WorkflowRunStatus = 'RUNNING' | 'COMPLETED' | 'CANCELLED';

export interface WorkflowTrigger {
  type: WorkflowTriggerType;
  event?: string | null;
  cron?: string | null;
}

export interface TaskAutomation {
  kind: 'WEBHOOK';
  url: string;
  method?: 'POST' | 'GET';
  body?: Record<string, unknown> | null;
}

export interface WorkflowTaskDef {
  id: string;
  title: string;
  description?: string | null;
  type: TaskType;
  assigneeRole?: Role | null;
  assigneeEmployeeId?: string | null;
  assigneeName?: string | null;
  dueInHours?: number | null;
  dependsOn: string[];
  automation?: TaskAutomation | null;
  position?: { x: number; y: number } | null;
}

export interface WorkflowDto {
  id: string;
  name: string;
  description: string | null;
  titleTemplate: string | null;
  trigger: WorkflowTrigger;
  isActive: boolean;
  tasks: WorkflowTaskDef[];
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkflowBody {
  name: string;
  description?: string | null;
  titleTemplate?: string | null;
  trigger: WorkflowTrigger;
  isActive?: boolean;
  tasks: WorkflowTaskDef[];
}

export interface TaskDto {
  id: string;
  runId: string | null;
  runTitle: string | null;
  workflowId: string | null;
  defId: string | null;
  title: string;
  description: string | null;
  type: TaskType;
  status: TaskStatus;
  assigneeRole: Role | null;
  assigneeEmployeeId: string | null;
  assigneeName: string | null;
  dependsOn: string[];
  dueAt: string | null;
  isOverdue: boolean;
  startedAt: string | null;
  completedAt: string | null;
  completedByName: string | null;
  notes: string | null;
  output: string | null;
  createdAt: string;
}

export interface WorkflowRunDto {
  id: string;
  workflowId: string;
  workflowName: string;
  title: string;
  status: WorkflowRunStatus;
  /** null for coaches (they only see their own tasks). */
  context: Record<string, unknown> | null;
  startedByName: string | null;
  startedAt: string;
  completedAt: string | null;
  progress: { done: number; total: number };
  tasks?: TaskDto[];
}

export interface CreateTaskBody {
  title: string;
  description?: string | null;
  assigneeRole?: Role | null;
  assigneeEmployeeId?: string | null;
  assigneeName?: string | null;
  dueAt?: string | null;
  dependsOn?: string[];
}

export interface UpdateTaskBody {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  assigneeRole?: Role | null;
  assigneeEmployeeId?: string | null;
  assigneeName?: string | null;
  dueAt?: string | null;
  dependsOn?: string[];
  notes?: string | null;
}

export interface WorkflowStats {
  activeWorkflows: number;
  runningRuns: number;
  openTasks: number;
  overdueTasks: number;
  completedTasksThisWeek: number;
}

export interface WorkflowMeta {
  events: string[];
  roles: Role[];
}

/** GET /api/dashboard/operations — each block is null when its service is down. */
export interface OperationsSummary {
  staff: StaffStats | null;
  facility: FacilityStats | null;
  commerce: CommerceStats | null;
  training: TrainingStats | null;
  leads: LeadStats | null;
  workflows: WorkflowStats | null;
}

// ---------- v5 analytics & business KPIs ----------
export interface MembersAnalytics {
  total: number;
  active: number;
  expired: number;
  suspended: number;
  frozen: number;
  neverSubscribed: number;
  byGender: { gender: 'MALE' | 'FEMALE' | 'UNKNOWN'; count: number }[];
  byAgeGroup: { label: string; count: number }[];
  newPerMonth: { month: string; count: number }[];
  churnedLast30d: number;
  renewalRate90d: number;
}

export interface OnDutyEntry {
  employeeId: string;
  name: string;
  position: EmployeePosition;
  shift: ShiftDto | null;
  clockedInAt: string | null;
}

export interface TeamOverview {
  date: string;
  employees: { total: number; active: number; byPosition: { position: EmployeePosition; count: number }[] };
  onDutyNow: OnDutyEntry[];
  presentNow: number;
  shifts: ShiftDto[];
}

export interface MembershipKpis {
  gross: number;
  discounts: number;
  cancelled: number;
  net: number;
  cashCollected: number;
  mrr: number;
  activeMembers: number;
  arpu: number;
  monthly: { month: string; gross: number; discounts: number; cancelled: number; net: number; cash: number }[];
}

export interface CommerceKpis {
  gross: number;
  discounts: number;
  refunds: number;
  net: number;
  cogs: number;
  grossMargin: number;
  expenses: number;
  expensesByCategory: { category: ExpenseCategory; total: number }[];
  monthly: { month: string; gross: number; discounts: number; refunds: number; net: number; cogs: number; expenses: number }[];
}

export interface FinanceKpis {
  from: string;
  to: string;
  gmv: number;
  discounts: number;
  refunds: number;
  cancellations: number;
  nmv: number;
  cashCollected: number;
  cogs: number;
  grossMargin: number;
  grossMarginPct: number;
  expenses: number;
  operatingProfit: number;
  operatingMarginPct: number;
  mrr: number;
  arpu: number;
  activeMembers: number;
  breakdown: { memberships: MembershipKpis | null; shop: CommerceKpis | null };
  monthly: { month: string; gmv: number; nmv: number; expenses: number; profit: number; marginPct: number }[];
}
