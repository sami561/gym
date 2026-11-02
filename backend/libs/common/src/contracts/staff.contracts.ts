import { Actor } from './common.contracts';
import { PaymentMethod } from './membership.contracts';

export enum EmployeePosition {
  MANAGER = 'MANAGER',
  RECEPTION = 'RECEPTION',
  COACH = 'COACH',
  CLEANING = 'CLEANING',
  MAINTENANCE = 'MAINTENANCE',
  OTHER = 'OTHER',
}

export enum ContractType {
  CDI = 'CDI',
  CDD = 'CDD',
  FREELANCE = 'FREELANCE',
  STAGE = 'STAGE',
}

export enum SalaryType {
  MONTHLY = 'MONTHLY',
  HOURLY = 'HOURLY',
  PER_SESSION = 'PER_SESSION',
}

export enum EmployeeStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum LeaveType {
  ANNUAL = 'ANNUAL',
  SICK = 'SICK',
  UNPAID = 'UNPAID',
  OTHER = 'OTHER',
}

export enum LeaveStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum PayrollStatus {
  DRAFT = 'DRAFT',
  PAID = 'PAID',
}

export interface EmployeeDto {
  id: string;
  /** Linked auth account (staff/coach login), if any. */
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
  /** Monthly salary (MONTHLY), hourly rate (HOURLY) or rate per session (PER_SESSION), TND. */
  baseSalary: number;
  /** Personal-training commission, 0-1. */
  commissionRate: number;
  /** Tunisian national ID card number. */
  cin: string | null;
  cnssNumber: string | null;
  rib: string | null;
  status: EmployeeStatus;
  notes: string | null;
  createdAt: string;
}

export interface CreateEmployeeRequest {
  userId?: string | null;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  position: EmployeePosition;
  contractType: ContractType;
  hireDate: string;
  endDate?: string | null;
  salaryType: SalaryType;
  baseSalary: number;
  commissionRate?: number;
  cin?: string | null;
  cnssNumber?: string | null;
  rib?: string | null;
  notes?: string | null;
}

export interface UpdateEmployeeRequest {
  id: string;
  data: Partial<CreateEmployeeRequest> & { status?: EmployeeStatus };
}

export interface ListEmployeesRequest {
  search?: string;
  position?: EmployeePosition;
  status?: EmployeeStatus;
}

export interface ShiftDto {
  id: string;
  employeeId: string;
  employeeName: string;
  startsAt: string;
  endsAt: string;
  /** Free text: "Accueil", "Ménage salle cardio"... */
  task: string | null;
  roomName: string | null;
}

export interface CreateShiftRequest {
  employeeId: string;
  startsAt: string;
  endsAt: string;
  task?: string | null;
  roomName?: string | null;
  /** Also create the same shift on the following N weeks (0-12). */
  repeatWeeks?: number;
}

export interface UpdateShiftRequest {
  id: string;
  data: Partial<Omit<CreateShiftRequest, 'repeatWeeks'>>;
}

export interface ListShiftsRequest {
  from?: string;
  to?: string;
  employeeId?: string;
}

export interface AttendanceDto {
  id: string;
  employeeId: string;
  employeeName: string;
  clockIn: string;
  clockOut: string | null;
  /** Worked minutes, null while still clocked in. */
  minutes: number | null;
  /** Minutes late versus the planned shift start, if a shift exists that day. */
  lateMinutes: number | null;
  source: 'MANUAL' | 'DEVICE' | 'KIOSK';
}

export interface ClockRequest {
  employeeId: string;
  source?: 'MANUAL' | 'DEVICE' | 'KIOSK';
  /** ISO date-time, defaults to now (MANUAL corrections). */
  at?: string;
}

export interface ListAttendanceRequest {
  from?: string;
  to?: string;
  employeeId?: string;
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

export interface CreateLeaveRequest {
  employeeId: string;
  type: LeaveType;
  from: string;
  to: string;
  reason?: string | null;
}

export interface DecideLeaveRequest {
  id: string;
  status: LeaveStatus.APPROVED | LeaveStatus.REJECTED;
  actor: Actor;
}

export interface ListLeavesRequest {
  status?: LeaveStatus;
  employeeId?: string;
}

export interface PayrollDto {
  id: string;
  employeeId: string;
  employeeName: string;
  /** YYYY-MM */
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

export interface GeneratePayrollRequest {
  /** YYYY-MM, defaults to the previous month. */
  period?: string;
}

export interface UpdatePayrollRequest {
  id: string;
  data: { bonuses?: number; deductions?: number; commissions?: number; notes?: string | null };
}

export interface PayPayrollRequest {
  id: string;
  method: PaymentMethod;
  actor: Actor;
}

export interface ListPayrollRequest {
  period?: string;
  employeeId?: string;
}

export interface StaffStats {
  activeEmployees: number;
  presentNow: number;
  pendingLeaves: number;
  /** Net payroll of the current month (drafts + paid). */
  payrollThisMonth: number;
}
