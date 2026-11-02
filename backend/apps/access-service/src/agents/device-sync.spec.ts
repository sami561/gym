import { AccessMethod, MemberStatus } from '@app/common';
import {
  DEVICE_EVENT_MAX_AGE_MS,
  DEVICE_EVENT_MAX_AHEAD_MS,
  describeRejections,
  deviceEventKey,
  parseDeviceEvent,
  toDeviceUser,
} from './device-sync';

describe('device sync rules', () => {
  const now = Date.UTC(2026, 10, 2, 9, 0, 0);
  const iso = (ms: number) => new Date(ms).toISOString();

  describe('parseDeviceEvent', () => {
    it('accepts a punch of the last 7 days and reads the method', () => {
      expect(parseDeviceEvent({ deviceUserId: '42', method: 'FINGERPRINT', at: iso(now - 60_000) }, now)).toEqual({
        ok: true,
        deviceUid: 42,
        at: new Date(now - 60_000),
        loggedAt: new Date(now - 60_000),
        method: AccessMethod.FINGERPRINT,
      });
      const card = parseDeviceEvent({ deviceUserId: 7, method: 'CARD', at: iso(now - DEVICE_EVENT_MAX_AGE_MS) }, now);
      expect(card).toMatchObject({ ok: true, deviceUid: 7, method: AccessMethod.CARD });
    });

    it('keeps the terminal time up to 5 minutes ahead, and logs a punch further ahead at reception', () => {
      const drift = iso(now + DEVICE_EVENT_MAX_AHEAD_MS);
      expect(parseDeviceEvent({ deviceUserId: '1', at: drift }, now)).toMatchObject({ ok: true, loggedAt: new Date(drift) });
      // Terminal clock an hour fast (or set to the wrong timezone): the door did open, now.
      const fast = iso(now + 3_600_000);
      expect(parseDeviceEvent({ deviceUserId: '1', at: fast }, now)).toMatchObject({
        ok: true,
        at: new Date(fast),
        loggedAt: new Date(now),
      });
    });

    it('refuses punches older than 7 days', () => {
      expect(parseDeviceEvent({ deviceUserId: '1', at: iso(now - DEVICE_EVENT_MAX_AGE_MS - 1000) }, now)).toEqual({
        ok: false,
        rejection: 'too-old',
      });
    });

    it.each([
      [null],
      [{}],
      [{ deviceUserId: 'abc', at: '2026-11-02T08:00:00Z' }],
      [{ deviceUserId: '0', at: '2026-11-02T08:00:00Z' }],
      [{ deviceUserId: '1e3', at: '2026-11-02T08:00:00Z' }],
      [{ deviceUserId: '9999999999', at: '2026-11-02T08:00:00Z' }],
      [{ deviceUserId: 1.5, at: '2026-11-02T08:00:00Z' }],
      [{ deviceUserId: '12', at: 'yesterday' }],
      [{ deviceUserId: '12' }],
    ])('refuses the malformed punch %j', (event) => {
      expect(parseDeviceEvent(event, now)).toEqual({ ok: false, rejection: 'malformed' });
    });
  });

  it('deviceEventKey identifies a punch by door, terminal user and time', () => {
    expect(deviceEventKey('door-1', 42, new Date(now))).toBe('door-1:42:2026-11-02T09:00:00.000Z');
  });

  it('describeRejections lists the non-zero counts', () => {
    expect(describeRejections({ 'foreign-door': 2, malformed: 0, 'too-old': 1 })).toBe('2 foreign door, 1 too old');
  });

  describe('toDeviceUser', () => {
    const member = {
      deviceUid: 12,
      firstName: 'Amira',
      lastName: 'Ben Salah-Trabelsi de la Montagne',
      cardNumber: '0012345678',
      status: MemberStatus.ACTIVE,
      windows: [{ from: '2026-10-15', until: '2026-11-14' }],
    };

    it('sends the badge of a member who may enter, with the name cut to 24 characters', () => {
      expect(toDeviceUser(member, '2026-11-02')).toEqual({
        deviceUid: 12,
        name: 'Amira Ben Salah-Trabelsi',
        cardNumber: '0012345678',
        active: true,
      });
    });

    it('keeps expired and suspended members in the list, inactive and without their badge', () => {
      expect(toDeviceUser(member, '2026-11-20')).toMatchObject({ deviceUid: 12, cardNumber: null, active: false });
      expect(toDeviceUser({ ...member, status: MemberStatus.SUSPENDED }, '2026-11-02')).toMatchObject({
        cardNumber: null,
        active: false,
      });
    });

    it('keeps a deleted member in the list as inactive, whatever its row still says', () => {
      expect(toDeviceUser({ ...member, removedAt: new Date('2026-11-01T10:00:00Z') }, '2026-11-02')).toMatchObject({
        deviceUid: 12,
        cardNumber: null,
        active: false,
      });
    });
  });
});
