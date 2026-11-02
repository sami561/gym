import { buildAccessCode, DateWindow, MemberStatus, parseAccessCode } from '@app/common';
import {
  appOpenContext,
  checkGeofence,
  checkMember,
  checkQr,
  formatDay,
  MAX_ACCURACY_ALLOWANCE,
  REASONS,
} from './access-decision';

const TODAY = '2026-11-02';
const member = (windows: DateWindow[], status = MemberStatus.ACTIVE) => ({ status, windows });

describe('access decision edge cases', () => {
  it('writes days the French way in the denial messages', () => {
    expect(formatDay('2026-01-05')).toBe('05/01/2026');
    expect(REASONS.notStarted('2026-11-10')).toBe('Abonnement valable à partir du 10/11/2026.');
    expect(REASONS.expired('2026-10-31')).toBe('Abonnement expiré le 31/10/2026. Merci de le renouveler.');
  });

  describe('checkMember between, before and after windows', () => {
    it('explains the next start when the member is between two paid periods', () => {
      const windows = [
        { from: '2026-09-01', until: '2026-10-31' },
        { from: '2026-11-05', until: '2026-12-04' },
      ];
      expect(checkMember(member(windows), TODAY)).toEqual({ ok: false, reason: REASONS.notStarted('2026-11-05') });
    });

    it('names the earliest upcoming start and the latest past end, whatever the order', () => {
      const future = [
        { from: '2027-01-01', until: '2027-01-30' },
        { from: '2026-12-01', until: '2026-12-30' },
      ];
      expect(checkMember(member(future), TODAY)).toEqual({ ok: false, reason: REASONS.notStarted('2026-12-01') });
      const past = [
        { from: '2026-08-01', until: '2026-08-30' },
        { from: '2026-09-01', until: '2026-09-30' },
      ];
      expect(checkMember(member(past), TODAY)).toEqual({ ok: false, reason: REASONS.expired('2026-09-30') });
    });

    it('grants as soon as one window covers the day, overlapping ones included', () => {
      const windows = [
        { from: '2026-10-01', until: '2026-11-01' },
        { from: '2026-11-02', until: '2026-12-01' },
      ];
      expect(checkMember(member(windows), TODAY)).toEqual({ ok: true });
      expect(checkMember(member(windows), '2026-11-01')).toEqual({ ok: true });
    });

    it('treats a corrupt windows value as no subscription', () => {
      expect(checkMember({ status: MemberStatus.ACTIVE, windows: null as unknown as DateWindow[] }, TODAY)).toEqual({
        ok: false,
        reason: REASONS.noSubscription,
      });
    });

    it('denies a suspended member before looking at the windows', () => {
      expect(checkMember(member([], MemberStatus.SUSPENDED), TODAY)).toEqual({ ok: false, reason: REASONS.suspended });
    });
  });

  describe('checkGeofence boundaries', () => {
    const gym = { lat: 35.8456, lng: 10.6178 };
    // ~111.2 m per 0.001° of latitude.
    const north = (meters: number) => ({ latitude: gym.lat + meters / 111_195, longitude: gym.lng });

    it('grants exactly at the radius and denies just beyond', () => {
      expect(checkGeofence(north(149.9), gym, 150).ok).toBe(true);
      expect(checkGeofence(north(150.5), gym, 150).ok).toBe(false);
    });

    it('gives the benefit of the reported accuracy up to 50 m, never a negative one', () => {
      expect(MAX_ACCURACY_ALLOWANCE).toBe(50);
      expect(checkGeofence({ ...north(199), accuracy: 60 }, gym, 150).ok).toBe(true);
      expect(checkGeofence({ ...north(201), accuracy: 60 }, gym, 150).ok).toBe(false);
      expect(checkGeofence({ ...north(140), accuracy: -500 }, gym, 150).ok).toBe(true);
      expect(checkGeofence({ ...north(160), accuracy: -500 }, gym, 150).ok).toBe(false);
      expect(checkGeofence({ ...north(160), accuracy: Number.NaN }, gym, 150).ok).toBe(false);
    });

    it('reports the rounded distance when too far', () => {
      const result = checkGeofence(north(612.4), gym, 150);
      expect(result).toEqual({ ok: false, reason: REASONS.tooFar(612), distance: expect.closeTo(612.4, 0) });
      expect(REASONS.tooFar(612)).toBe('Vous êtes trop loin de la salle (612 m). Approchez-vous de l’entrée.');
    });

    it('rejects missing positions and impossible longitudes', () => {
      expect(checkGeofence(undefined as unknown as { latitude: number; longitude: number }, gym, 150)).toEqual({
        ok: false,
        reason: REASONS.invalidPosition,
      });
      expect(checkGeofence({ latitude: 35.8, longitude: 181 }, gym, 150).ok).toBe(false);
      expect(checkGeofence({ latitude: '35.8' as unknown as number, longitude: 10.6 }, gym, 150).ok).toBe(false);
    });
  });

  describe('appOpenContext', () => {
    it('keeps a zero accuracy, clamps a negative one and caps the address length', () => {
      expect(appOpenContext({ latitude: 35.8, longitude: 10.6, accuracy: 0, clientIp: '197.15.20.33' }, 0)).toMatchObject({
        accuracy: 0,
        distanceMeters: 0,
      });
      expect(appOpenContext({ accuracy: -3, clientIp: `  ${'1'.repeat(80)}  ` }, undefined)).toMatchObject({
        accuracy: 0,
        clientIp: '1'.repeat(64),
      });
    });

    it('drops non-numeric coordinates, an infinite distance and a non-text address', () => {
      expect(
        appOpenContext({ latitude: '35.8' as unknown as number, longitude: Number.POSITIVE_INFINITY, clientIp: 42 }, Number.POSITIVE_INFINITY),
      ).toEqual({ latitude: null, longitude: null, accuracy: null, distanceMeters: null, clientIp: null });
    });
  });

  describe('checkQr anti-replay', () => {
    const secret = 'a'.repeat(64);
    const now = Date.UTC(2026, 10, 2, 9, 0, 0);
    const parsed = parseAccessCode(buildAccessCode('MEL-00001', secret, now))!;

    it('accepts a code newer than the last one used', () => {
      expect(checkQr(parsed, { accessSecret: secret, lastQrStep: parsed.step - 1 }, now)).toEqual({ ok: true });
    });

    it('accepts the previous code during the next 30 seconds once, then refuses it', () => {
      expect(checkQr(parsed, { accessSecret: secret, lastQrStep: null }, now + 30_000)).toEqual({ ok: true });
      expect(checkQr(parsed, { accessSecret: secret, lastQrStep: parsed.step }, now + 30_000)).toEqual({
        ok: false,
        reason: REASONS.replayedQr,
      });
    });

    it('refuses an older code after a newer one was used', () => {
      expect(checkQr(parsed, { accessSecret: secret, lastQrStep: parsed.step + 1 }, now + 30_000)).toEqual({
        ok: false,
        reason: REASONS.replayedQr,
      });
    });

    it('checks the signature before the replay counter', () => {
      expect(checkQr(parsed, { accessSecret: 'b'.repeat(64), lastQrStep: parsed.step }, now)).toEqual({
        ok: false,
        reason: REASONS.expiredQr,
      });
    });
  });
});
