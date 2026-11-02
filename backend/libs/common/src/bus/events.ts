import { Role } from '../contracts/auth.contracts';
import { MemberStatus, PaymentMethod } from '../contracts/membership.contracts';
import { AccessLogDto } from '../contracts/access.contracts';

/**
 * Domain events (fire-and-forget, fan-out to every interested service).
 * Events marked [webhook] are forwarded by notification-service to n8n.
 */
export const EVENTS = {
  userCreated: 'user.created',
  userUpdated: 'user.updated',
  userDeleted: 'user.deleted',
  memberCreated: 'member.created', // [webhook]
  memberUpdated: 'member.updated',
  memberDeleted: 'member.deleted',
  entitlementChanged: 'member.entitlement-changed',
  subscriptionCreated: 'subscription.created', // [webhook]
  subscriptionExpiring: 'subscription.expiring', // [webhook]
  subscriptionExpired: 'subscription.expired', // [webhook]
  paymentReceived: 'payment.received', // [webhook]
  bookingCreated: 'booking.created', // [webhook]
  bookingCancelled: 'booking.cancelled',
  accessLogged: 'access.logged',
  leadCreated: 'lead.created', // [webhook]
  leadConverted: 'lead.converted',
  saleCompleted: 'sale.completed', // [webhook]
  stockLow: 'stock.low', // [webhook]
  maintenanceOpened: 'maintenance.opened', // [webhook]
  maintenanceResolved: 'maintenance.resolved',
  payrollPaid: 'payroll.paid',
  workflowCompleted: 'workflow.completed',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/** Events notification-service forwards to the n8n webhook. */
export const WEBHOOK_EVENTS: EventName[] = [
  EVENTS.memberCreated,
  EVENTS.subscriptionCreated,
  EVENTS.subscriptionExpiring,
  EVENTS.subscriptionExpired,
  EVENTS.paymentReceived,
  EVENTS.bookingCreated,
  EVENTS.leadCreated,
  EVENTS.saleCompleted,
  EVENTS.stockLow,
  EVENTS.maintenanceOpened,
];

export interface UserEvent {
  userId: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  phone: string | null;
}

export interface MemberCreatedEvent {
  memberId: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: MemberStatus;
  joinedAt: string;
}

export interface MemberUpdatedEvent {
  memberId: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: MemberStatus;
}

export interface MemberDeletedEvent {
  memberId: string;
}

/** Full access entitlement of a member; consumers replace what they stored. */
export interface EntitlementChangedEvent {
  memberId: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  status: MemberStatus;
  windows: { from: string; until: string }[];
}

export interface SubscriptionCreatedEvent {
  subscriptionId: string;
  memberId: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  planName: string;
  startDate: string;
  endDate: string;
  price: number;
}

export interface SubscriptionExpiringEvent {
  subscriptionId: string;
  memberId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  planName: string;
  endDate: string;
  daysLeft: number;
}

export interface SubscriptionExpiredEvent {
  subscriptionId: string;
  memberId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  planName: string;
  endDate: string;
}

export interface PaymentReceivedEvent {
  paymentId: string;
  memberId: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  email: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  planName: string | null;
  paidAt: string;
}

export interface BookingEvent {
  bookingId: string;
  sessionId: string;
  memberId: string;
  memberName: string;
  email: string | null;
  sessionTitle: string;
  startsAt: string;
  endsAt: string;
  coachName: string | null;
  room: string | null;
}

export interface LeadCreatedEvent {
  leadId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  source: string;
  trialDate: string | null;
  interestPlanName: string | null;
  message: string | null;
}

export interface LeadConvertedEvent {
  leadId: string;
  memberId: string;
}

export interface SaleCompletedEvent {
  saleId: string;
  number: string;
  memberId: string | null;
  memberName: string | null;
  email: string | null;
  items: { name: string; quantity: number; unitPrice: number; total: number }[];
  total: number;
  paymentMethod: PaymentMethod;
  createdAt: string;
}

export interface StockLowEvent {
  productId: string;
  name: string;
  stock: number;
  threshold: number;
}

export interface MaintenanceEvent {
  ticketId: string;
  title: string;
  priority: string;
  equipmentName: string | null;
  roomName: string | null;
  cost: number | null;
  at: string;
}

export interface PayrollPaidEvent {
  payrollId: string;
  employeeId: string;
  employeeName: string;
  period: string;
  netAmount: number;
  method: PaymentMethod;
  paidAt: string;
}

export interface WorkflowCompletedEvent {
  runId: string;
  workflowId: string;
  workflowName: string;
  title: string;
  completedAt: string;
}

export interface EventPayloads {
  'user.created': UserEvent;
  'user.updated': UserEvent;
  'user.deleted': { userId: string };
  'member.created': MemberCreatedEvent;
  'member.updated': MemberUpdatedEvent;
  'member.deleted': MemberDeletedEvent;
  'member.entitlement-changed': EntitlementChangedEvent;
  'subscription.created': SubscriptionCreatedEvent;
  'subscription.expiring': SubscriptionExpiringEvent;
  'subscription.expired': SubscriptionExpiredEvent;
  'payment.received': PaymentReceivedEvent;
  'booking.created': BookingEvent;
  'booking.cancelled': BookingEvent;
  'access.logged': AccessLogDto;
  'lead.created': LeadCreatedEvent;
  'lead.converted': LeadConvertedEvent;
  'sale.completed': SaleCompletedEvent;
  'stock.low': StockLowEvent;
  'maintenance.opened': MaintenanceEvent;
  'maintenance.resolved': MaintenanceEvent;
  'payroll.paid': PayrollPaidEvent;
  'workflow.completed': WorkflowCompletedEvent;
}
