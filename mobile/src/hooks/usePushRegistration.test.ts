import { describe, expect, it } from '@jest/globals';
import { notificationRoute } from './usePushRegistration';

// Payloads as notification-service sends them (backend/apps/notification-service/src/push/push-messages.ts).
const classScreen = { pathname: '/class/[id]', params: { id: 'session-1' } };

describe('notificationRoute', () => {
  it.each(['booking.promoted', 'booking.reminder'])('opens the class of a %s push', (type) => {
    expect(notificationRoute({ type, bookingId: 'booking-1', sessionId: 'session-1', screen: 'bookings' })).toEqual(
      classScreen,
    );
  });

  it('opens a class for any push pointing at the class screen', () => {
    expect(notificationRoute({ screen: 'class', sessionId: 'session-1' })).toEqual(classScreen);
  });

  it('sends payment pushes to the history', () => {
    expect(notificationRoute({ type: 'payment.received', paymentId: 'payment-1', screen: 'payments' })).toBe('/history');
  });

  it.each(['subscription.expiring', 'subscription.expired'])('sends %s pushes to the membership card', (type) => {
    expect(notificationRoute({ type, subscriptionId: 'sub-1', screen: 'membership' })).toBe('/');
  });

  it('needs a session id (a string) to open a class', () => {
    expect(notificationRoute({ type: 'booking.promoted' })).toBeNull();
    expect(notificationRoute({ type: 'booking.promoted', sessionId: 42 })).toBeNull();
  });

  it('follows in-app paths only, never external links', () => {
    expect(notificationRoute({ url: '/history' })).toBe('/history');
    expect(notificationRoute({ url: 'https://example.com/promo' })).toBeNull();
    expect(notificationRoute({ url: 'meliora://history' })).toBeNull();
  });

  // '//host/path' starts with '/', but expo-router (shouldLinkExternally) opens it in the browser as
  // https://host/path.
  it('treats protocol-relative links as external', () => {
    expect(notificationRoute({ url: '//example.com/promo' })).toBeNull();
  });

  it('treats a backslash or more slashes after the first one as external too', () => {
    // URL parsers read '/\host/path' as '//host/path'.
    expect(notificationRoute({ url: '/\\example.com/promo' })).toBeNull();
    expect(notificationRoute({ url: '///example.com/promo' })).toBeNull();
  });

  it('follows the root path and nested in-app paths', () => {
    expect(notificationRoute({ url: '/' })).toBe('/');
    expect(notificationRoute({ url: '/class/session-1' })).toBe('/class/session-1');
  });

  it('opens the class rather than a url when both are given', () => {
    expect(notificationRoute({ type: 'booking.reminder', sessionId: 'session-1', url: '/history' })).toEqual(classScreen);
  });

  it('opens nothing for an empty or unknown payload', () => {
    expect(notificationRoute(undefined)).toBeNull();
    expect(notificationRoute({})).toBeNull();
    expect(notificationRoute({ type: 'booking.cancelled', sessionId: 'session-1' })).toBeNull();
    expect(notificationRoute({ screen: 'settings' })).toBeNull();
  });
});
