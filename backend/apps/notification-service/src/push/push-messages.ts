import {
  EVENTS,
  PaymentReceivedEvent,
  SubscriptionExpiredEvent,
  SubscriptionExpiringEvent,
} from '@app/common';

export interface PushMessage {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/** 2026-11-05 or an ISO date-time → 05/11/2026 */
export function formatDateFr(value: string): string {
  const [y, m, d] = value.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : value;
}

/** 120.5 → "120,500 DT" */
export function formatAmount(amount: number): string {
  return `${Number(amount).toFixed(3).replace('.', ',')} DT`;
}

export function expiringMessage(event: SubscriptionExpiringEvent): PushMessage {
  const when =
    event.daysLeft <= 0
      ? "aujourd'hui"
      : `dans ${event.daysLeft} jour${event.daysLeft > 1 ? 's' : ''} (le ${formatDateFr(event.endDate)})`;
  return {
    title: 'Abonnement bientôt expiré',
    body: `Votre abonnement ${event.planName} expire ${when}. Renouvelez-le à l'accueil pour garder votre accès.`,
    data: { type: EVENTS.subscriptionExpiring, subscriptionId: event.subscriptionId, screen: 'membership' },
  };
}

export function expiredMessage(event: SubscriptionExpiredEvent): PushMessage {
  return {
    title: 'Abonnement expiré',
    body: `Votre abonnement ${event.planName} a expiré le ${formatDateFr(event.endDate)}. Passez à l'accueil pour le renouveler.`,
    data: { type: EVENTS.subscriptionExpired, subscriptionId: event.subscriptionId, screen: 'membership' },
  };
}

export function paymentMessage(event: PaymentReceivedEvent): PushMessage {
  const plan = event.planName ? ` pour ${event.planName}` : '';
  return {
    title: 'Paiement reçu',
    body: `Merci ${event.firstName} ! Paiement de ${formatAmount(event.amount)} reçu${plan}.`,
    data: { type: EVENTS.paymentReceived, paymentId: event.paymentId, screen: 'payments' },
  };
}

/** Events that also notify the member's phone; every other webhook event is n8n only. */
export function pushFor(event: string, data: unknown): { userId: string; message: PushMessage } | null {
  switch (event) {
    case EVENTS.subscriptionExpiring: {
      const payload = data as SubscriptionExpiringEvent;
      return { userId: payload.memberId, message: expiringMessage(payload) };
    }
    case EVENTS.subscriptionExpired: {
      const payload = data as SubscriptionExpiredEvent;
      return { userId: payload.memberId, message: expiredMessage(payload) };
    }
    case EVENTS.paymentReceived: {
      const payload = data as PaymentReceivedEvent;
      return { userId: payload.memberId, message: paymentMessage(payload) };
    }
    default:
      return null;
  }
}

/** Tokens Expo rejected as DeviceNotRegistered (tickets come back in message order). */
export function unregisteredTokens(messages: { to: string }[], tickets: ExpoTicket[]): string[] {
  return tickets.flatMap((ticket, index) =>
    ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' && messages[index]
      ? [messages[index].to]
      : [],
  );
}

export function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}
