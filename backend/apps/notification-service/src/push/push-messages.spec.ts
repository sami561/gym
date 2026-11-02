import { EVENTS, PaymentMethod } from '@app/common';
import { chunk, formatAmount, formatDateFr, pushFor, unregisteredTokens } from './push-messages';

describe('push messages', () => {
  it('formats French dates and TND amounts', () => {
    expect(formatDateFr('2026-11-05')).toBe('05/11/2026');
    expect(formatDateFr('2026-11-05T09:00:00.000Z')).toBe('05/11/2026');
    expect(formatAmount(120.5)).toBe('120,500 DT');
  });

  it('builds the expiry reminder for the member', () => {
    const push = pushFor(EVENTS.subscriptionExpiring, {
      subscriptionId: 's1',
      memberId: 'm1',
      firstName: 'Amine',
      lastName: 'B',
      email: 'a@b.tn',
      phone: null,
      planName: 'Mensuel',
      endDate: '2026-11-05',
      daysLeft: 3,
    });
    expect(push?.userId).toBe('m1');
    expect(push?.message.body).toContain('Votre abonnement Mensuel expire dans 3 jours (le 05/11/2026)');
    expect(push?.message.data).toMatchObject({ type: 'subscription.expiring', screen: 'membership' });
  });

  it('uses singular / today wording', () => {
    const base = {
      subscriptionId: 's1',
      memberId: 'm1',
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.tn',
      phone: null,
      planName: 'Mensuel',
      endDate: '2026-11-03',
    };
    expect(pushFor(EVENTS.subscriptionExpiring, { ...base, daysLeft: 1 })?.message.body).toContain('dans 1 jour (');
    expect(pushFor(EVENTS.subscriptionExpiring, { ...base, daysLeft: 0 })?.message.body).toContain("expire aujourd'hui");
    expect(pushFor(EVENTS.subscriptionExpired, base)?.message.body).toContain('a expiré le 03/11/2026');
  });

  it('thanks the member for a payment', () => {
    const push = pushFor(EVENTS.paymentReceived, {
      paymentId: 'p1',
      memberId: 'm1',
      memberCode: 'MEL-00001',
      firstName: 'Amine',
      lastName: 'B',
      email: 'a@b.tn',
      amount: 90,
      method: PaymentMethod.CASH,
      reference: null,
      planName: 'Mensuel',
      paidAt: '2026-11-02T10:00:00.000Z',
    });
    expect(push?.message.body).toBe('Merci Amine ! Paiement de 90,000 DT reçu pour Mensuel.');
  });

  const booking = {
    bookingId: 'b1',
    sessionId: 's1',
    memberId: 'm1',
    memberName: 'Amine Test',
    email: 'a@b.tn',
    sessionTitle: 'CrossFit',
    // 17:00 UTC = 18:00 in Tunis (UTC+1, no DST)
    startsAt: '2026-11-03T17:00:00.000Z',
    endsAt: '2026-11-03T18:00:00.000Z',
    coachName: 'Sami',
    room: 'Salle 1',
    status: 'BOOKED',
    spotNumber: 4,
    waitlistPosition: null,
  };

  it('tells a waitlisted member they got the place, in the gym timezone', () => {
    const push = pushFor(EVENTS.bookingPromoted, booking);
    expect(push?.userId).toBe('m1');
    expect(push?.message.title).toBe('Place confirmée');
    expect(push?.message.body).toBe(
      "Une place s'est libérée pour CrossFit — vous êtes inscrit(e) (03/11 à 18:00, place n°4).",
    );
    expect(push?.message.data).toMatchObject({ type: 'booking.promoted', sessionId: 's1', bookingId: 'b1' });
  });

  it('reminds the member when the class starts', () => {
    expect(pushFor(EVENTS.bookingReminder, booking)?.message.data).toMatchObject({
      type: 'booking.reminder',
      sessionId: 's1',
      bookingId: 'b1',
    });
    expect(pushFor(EVENTS.bookingReminder, booking)?.message.body).toBe(
      'CrossFit commence à 18:00 (Salle 1, place n°4).',
    );
    expect(pushFor(EVENTS.bookingReminder, { ...booking, room: null, spotNumber: null })?.message.body).toBe(
      'CrossFit commence à 18:00.',
    );
  });

  it('does not push for n8n-only events', () => {
    expect(pushFor(EVENTS.memberCreated, { memberId: 'm1' })).toBeNull();
    expect(pushFor(EVENTS.leadCreated, { leadId: 'l1' })).toBeNull();
    expect(pushFor(EVENTS.stockLow, { productId: 'p1' })).toBeNull();
    expect(pushFor(EVENTS.bookingCreated, { bookingId: 'b1', memberId: 'm1' })).toBeNull();
  });

  it('finds tokens Expo reports as DeviceNotRegistered', () => {
    const messages = [{ to: 'ExponentPushToken[a]' }, { to: 'ExponentPushToken[b]' }, { to: 'ExponentPushToken[c]' }];
    const tickets = [
      { status: 'ok' as const, id: '1' },
      { status: 'error' as const, details: { error: 'DeviceNotRegistered' } },
      { status: 'error' as const, details: { error: 'MessageRateExceeded' } },
    ];
    expect(unregisteredTokens(messages, tickets)).toEqual(['ExponentPushToken[b]']);
  });

  it('splits messages in batches of at most 100', () => {
    expect(chunk(Array.from({ length: 250 }, (_, i) => i), 100).map((b) => b.length)).toEqual([100, 100, 50]);
  });
});
