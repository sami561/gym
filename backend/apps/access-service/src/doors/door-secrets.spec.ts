import { BadRequestException } from '@nestjs/common';
import { DOOR_SECRET_MASK } from '@app/common';
import { maskDoorConfig, maskUrlSecrets, restoreMaskedSecrets } from './door-secrets';

const MASK = DOOR_SECRET_MASK;

describe('door config secrets', () => {
  const relay = {
    url: 'http://192.168.1.50/cm?user=admin&password=s3cret&cmnd=Power%20On&toggle_after={seconds}',
    method: 'POST',
    headers: { Authorization: 'Bearer abc', Accept: 'application/json' },
    basicAuth: { username: 'admin', password: 'relay-pass' },
    body: { action: 'open', apiToken: 'tok-123', seconds: '{seconds}' },
    timeoutMs: 3000,
  };
  const zkteco = { ip: '192.168.1.201', port: 4370, commKey: 123456, password: 'zk-pass', syncUsers: true };

  describe('maskDoorConfig', () => {
    it('keeps the shape and masks headers, basicAuth.password and secret keys at any depth', () => {
      expect(maskDoorConfig(relay)).toEqual({
        url: `http://192.168.1.50/cm?user=admin&password=${MASK}&cmnd=Power%20On&toggle_after={seconds}`,
        method: 'POST',
        headers: { Authorization: MASK, Accept: MASK },
        basicAuth: { username: 'admin', password: MASK },
        body: { action: 'open', apiToken: MASK, seconds: '{seconds}' },
        timeoutMs: 3000,
      });
    });

    it('masks the ZKTeco password and numeric comm key, nothing else', () => {
      expect(maskDoorConfig(zkteco)).toEqual({ ...zkteco, commKey: MASK, password: MASK });
    });

    it('masks every value of an object under a secret key except who it is for', () => {
      expect(maskDoorConfig({ auth: { user: 'u', bearer: 'b', nested: { login: 'l', pin: '1' } }, tokens: ['a', 'b'] })).toEqual({
        auth: { user: 'u', bearer: MASK, nested: { login: 'l', pin: MASK } },
        tokens: [MASK, MASK],
      });
    });

    it('masks secrets in lists of lists and under pwd / pin / code keys', () => {
      expect(
        maskDoorConfig({
          body: { steps: [[{ password: 'deep', label: 'a' }], 'open'], pin: '4321', doorCode: 1234 },
          creds: { user: 'u', pwd: 'p' },
        }),
      ).toEqual({
        body: { steps: [[{ password: MASK, label: 'a' }], 'open'], pin: MASK, doorCode: MASK },
        creds: { user: 'u', pwd: MASK },
      });
    });

    it('leaves empty strings, booleans and null visible', () => {
      expect(maskDoorConfig({ password: '', apiKey: null, useAuth: false })).toEqual({
        password: '',
        apiKey: null,
        useAuth: false,
      });
    });

    it('does not touch the stored object', () => {
      const stored = structuredClone(relay);
      maskDoorConfig(stored);
      expect(stored).toEqual(relay);
    });

    it('returns {} for a missing config', () => {
      expect(maskDoorConfig(null)).toEqual({});
      expect(maskDoorConfig(undefined)).toEqual({});
    });
  });

  describe('maskUrlSecrets', () => {
    it('masks secret query parameters and keeps placeholders and the rest as typed', () => {
      expect(maskUrlSecrets('http://relay/rpc?id=0&auth_key=k1&token=t2&on=true#frag')).toBe(
        `http://relay/rpc?id=0&auth_key=${MASK}&token=${MASK}&on=true#frag`,
      );
      expect(maskUrlSecrets('http://relay/open?toggle_after={seconds}')).toBe('http://relay/open?toggle_after={seconds}');
    });

    it('masks a legacy user:password@ but not a port', () => {
      expect(maskUrlSecrets('http://admin:pw@192.168.1.50/relay')).toBe(`http://admin:${MASK}@192.168.1.50/relay`);
      expect(maskUrlSecrets('http://192.168.1.50:8080/relay?x=a@b')).toBe('http://192.168.1.50:8080/relay?x=a@b');
    });

    it('masks the whole legacy password when the credentials hold an "@"', () => {
      expect(maskUrlSecrets('http://admin:p@ss@192.168.1.50/relay')).toBe(`http://admin:${MASK}@192.168.1.50/relay`);
      expect(maskUrlSecrets('http://ad@min:pw@192.168.1.50/relay')).toBe(`http://ad@min:${MASK}@192.168.1.50/relay`);
    });

    it('masks pwd, pin and code query parameters', () => {
      expect(maskUrlSecrets('http://relay/cgi?user=admin&pwd=p1&pin=1234&code=9&on=1')).toBe(
        `http://relay/cgi?user=admin&pwd=${MASK}&pin=${MASK}&code=${MASK}&on=1`,
      );
    });
  });

  describe('restoreMaskedSecrets', () => {
    it('round-trips: the masked config sent back is the stored config', () => {
      expect(restoreMaskedSecrets(maskDoorConfig(relay), relay)).toEqual(relay);
      expect(restoreMaskedSecrets(maskDoorConfig(zkteco), zkteco)).toEqual(zkteco);
    });

    it('takes new values as typed and keeps the stored ones under the mask', () => {
      const edited = {
        ...maskDoorConfig(relay),
        url: `http://192.168.1.51/cm?user=admin&password=${MASK}&cmnd=Power%20Off`,
        headers: { Authorization: 'Bearer new', Accept: MASK },
      };
      expect(restoreMaskedSecrets(edited, relay)).toEqual({
        ...relay,
        url: 'http://192.168.1.51/cm?user=admin&password=s3cret&cmnd=Power%20Off',
        headers: { Authorization: 'Bearer new', Accept: 'application/json' },
      });
    });

    it('accepts the mask percent-encoded in a URL', () => {
      expect(restoreMaskedSecrets({ url: 'http://r/?password=%2A%2A%2A%2A%2A%2A%2A%2A' }, { url: 'http://r/?password=pw' })).toEqual({
        url: 'http://r/?password=pw',
      });
    });

    it('refuses a mask with nothing stored at that place', () => {
      expect(() => restoreMaskedSecrets({ basicAuth: { username: 'a', password: MASK } }, null)).toThrow(BadRequestException);
      expect(() => restoreMaskedSecrets({ headers: { 'X-Key': MASK } }, { headers: { Authorization: 'x' } })).toThrow(
        /config\.headers\.X-Key/,
      );
      expect(() => restoreMaskedSecrets({ url: `http://r/?token=${MASK}` }, { url: 'http://r/' })).toThrow(/paramètre token/);
      expect(() => restoreMaskedSecrets({ password: MASK }, { password: { nested: true } })).toThrow(BadRequestException);
    });

    it('leaves a config without masks unchanged', () => {
      expect(restoreMaskedSecrets({ ip: '10.0.0.5', port: 4370 }, zkteco)).toEqual({ ip: '10.0.0.5', port: 4370 });
    });
  });
});
