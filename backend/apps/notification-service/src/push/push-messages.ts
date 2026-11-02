import {
  BookingEvent,
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

function inGymZone(value: string, options: Intl.DateTimeFormatOptions): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat('fr-FR', { ...options, timeZone: process.env.TZ || 'Africa/Tunis' }).format(date);
  } catch {
    return new Intl.DateTimeFormat('fr-FR', { ...options, timeZone: 'Africa/Tunis' }).format(date);
  }
}

/** ISO date-time → "18:00" in the gym timezone. */
export function formatTimeFr(value: string): string {
  return inGymZone(value, { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** ISO date-time → "03/11" in the gym timezone. */
export function formatDayFr(value: string): string {
  return inGymZone(value, { day: '2-digit', month: '2-digit' });
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

export function promotedMessage(event: BookingEvent): PushMessage {
  const spot = event.spotNumber ? `, place n°${event.spotNumber}` : '';
  return {
    title: 'Place confirmée',
    body: `Une place s'est libérée pour ${event.sessionTitle} — vous êtes inscrit(e) (${formatDayFr(event.startsAt)} à ${formatTimeFr(event.startsAt)}${spot}).`,
    data: { type: EVENTS.bookingPromoted, bookingId: event.bookingId, sessionId: event.sessionId, screen: 'bookings' },
  };
}

export function reminderMessage(event: BookingEvent): PushMessage {
  const details = [event.room, event.spotNumber ? `place n°${event.spotNumber}` : null].filter(Boolean);
  return {
    title: 'Rappel de séance',
    body: `${event.sessionTitle} commence à ${formatTimeFr(event.startsAt)}${details.length ? ` (${details.join(', ')})` : ''}.`,
    data: { type: EVENTS.bookingReminder, bookingId: event.bookingId, sessionId: event.sessionId, screen: 'bookings' },
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
    case EVENTS.bookingPromoted: {
      const payload = data as BookingEvent;
      return { userId: payload.memberId, message: promotedMessage(payload) };
    }
    case EVENTS.bookingReminder: {
      const payload = data as BookingEvent;
      return { userId: payload.memberId, message: reminderMessage(payload) };
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
