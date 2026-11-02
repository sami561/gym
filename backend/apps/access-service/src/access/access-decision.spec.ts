import { accessStep, buildAccessCode, MemberStatus, parseAccessCode } from '@app/common';
import { checkDoor, checkGeofence, checkMember, checkQr, REASONS } from './access-decision';

describe('access decision rules', () => {
  const today = '2026-11-02';
  const active = {
    status: MemberStatus.ACTIVE,
    windows: [{ from: '2026-10-15', until: '2026-11-14' }],
  };

  describe('checkMember', () => {
    it('grants an active member inside a paid window', () => {
      expect(checkMember(active, today)).toEqual({ ok: true });
    });

    it('grants on the first and the last day of the window (inclusive)', () => {
      expect(checkMember(active, '2026-10-15').ok).toBe(true);
      expect(checkMember(active, '2026-11-14').ok).toBe(true);
    });

    it('denies when the subscription window is over', () => {
      const result = checkMember({ ...active, windows: [{ from: '2026-09-01', until: '2026-10-31' }] }, today);
      expect(result).toEqual({ ok: false, reason: REASONS.expired('2026-10-31') });
      expect(result.ok || result.reason).toContain('31/10/2026');
    });

    it('denies a suspended member even with a valid window', () => {
      expect(checkMember({ ...active, status: MemberStatus.SUSPENDED }, today)).toEqual({
        ok: false,
        reason: REASONS.suspended,
      });
    });

    it('explains when the subscription has not started yet', () => {
      const result = checkMember({ ...active, windows: [{ from: '2026-11-10', until: '2026-12-09' }] }, today);
      expect(result).toEqual({ ok: false, reason: REASONS.notStarted('2026-11-10') });
    });

    it('denies a member without any subscription and an unknown member', () => {
      expect(checkMember({ ...active, windows: [] }, today)).toEqual({ ok: false, reason: REASONS.noSubscription });
      expect(checkMember(null, today)).toEqual({ ok: false, reason: REASONS.unknownMember });
    });
  });

  describe('checkDoor', () => {
    it('denies a deactivated door', () => {
      expect(checkDoor({ isActive: false })).toEqual({ ok: false, reason: REASONS.doorInactive });
      expect(checkDoor({ isActive: true })).toEqual({ ok: true });
    });
  });

  describe('checkGeofence', () => {
    const gym = { lat: 35.8456, lng: 10.6178 };

    it('grants a phone at the gym entrance', () => {
      expect(checkGeofence({ latitude: 35.8457, longitude: 10.6179 }, gym, 150).ok).toBe(true);
    });

    it('denies a phone outside the geofence', () => {
      // ~1.1 km north of the gym
      const result = checkGeofence({ latitude: 35.8556, longitude: 10.6178 }, gym, 150);
      expect(result.ok).toBe(false);
      expect(result.ok || result.reason).toMatch(/trop loin de la salle \(1\d{3} m\)/);
    });

    it('allows at most 50 m of GPS inaccuracy', () => {
      // ~180 m away: outside 150 m, inside 150 m + 50 m allowance
      const position = { latitude: 35.84722, longitude: 10.6178 };
      expect(checkGeofence(position, gym, 150).ok).toBe(false);
      expect(checkGeofence({ ...position, accuracy: 40 }, gym, 150).ok).toBe(true);
      // a huge reported inaccuracy is capped to 50 m
      expect(checkGeofence({ latitude: 35.8556, longitude: 10.6178, accuracy: 5000 }, gym, 150).ok).toBe(false);
    });

    it('rejects missing or absurd coordinates', () => {
      expect(checkGeofence({ latitude: Number.NaN, longitude: 10 }, gym, 150)).toEqual({
        ok: false,
        reason: REASONS.invalidPosition,
      });
      expect(checkGeofence({ latitude: 120, longitude: 10 }, gym, 150).ok).toBe(false);
    });
  });

  describe('checkQr', () => {
    const secret = 'a'.repeat(64);
    const now = Date.UTC(2026, 10, 2, 9, 0, 0);
    const code = buildAccessCode('MEL-00001', secret, now);
    const parsed = parseAccessCode(code);

    it('accepts a fresh, correctly signed code', () => {
      expect(checkQr(parsed, { accessSecret: secret, lastQrStep: null }, now)).toEqual({ ok: true });
    });

    it('rejects a replayed code (step already used)', () => {
      expect(checkQr(parsed, { accessSecret: secret, lastQrStep: accessStep(now) }, now)).toEqual({
        ok: false,
        reason: REASONS.replayedQr,
      });
    });

    it('rejects a code signed with another secret or too old', () => {
      expect(checkQr(parsed, { accessSecret: 'b'.repeat(64), lastQrStep: null }, now)).toEqual({
        ok: false,
        reason: REASONS.expiredQr,
      });
      expect(checkQr(parsed, { accessSecret: secret, lastQrStep: null }, now + 5 * 60_000)).toEqual({
        ok: false,
        reason: REASONS.expiredQr,
      });
    });

    it('rejects malformed codes and unknown members', () => {
      expect(checkQr(parseAccessCode('hello'), { accessSecret: secret, lastQrStep: null }, now)).toEqual({
        ok: false,
        reason: REASONS.invalidQr,
      });
      expect(checkQr(parsed, null, now)).toEqual({ ok: false, reason: REASONS.unknownMember });
    });
  });
});
