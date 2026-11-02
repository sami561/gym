import { BadRequestException } from '@nestjs/common';
import { buildRelayRequest, fillPlaceholders, validateRelayConfig } from './relay-config';

describe('relay config', () => {
  const values = { seconds: 7, doorId: 'b3c1a4e2-1111-4222-8333-444455556666' };

  describe('validateRelayConfig', () => {
    it('accepts a relay config and normalises the URL and the method', () => {
      expect(validateRelayConfig({ url: '  http://192.168.1.50/rpc/Switch.Set?id=0&toggle_after={seconds} ', method: 'post' })).toEqual({
        url: 'http://192.168.1.50/rpc/Switch.Set?id=0&toggle_after={seconds}',
        method: 'POST',
      });
      expect(validateRelayConfig({ url: 'https://relay.example.com/open' })).toEqual({
        url: 'https://relay.example.com/open',
        method: 'GET',
      });
    });

    it('keeps the other keys as they are', () => {
      const config = {
        url: 'http://10.0.0.8/open',
        method: 'PUT',
        headers: { 'X-Api-Key': 'k' },
        basicAuth: { username: 'admin', password: 'pw' },
        body: { open: true },
        timeoutMs: 2000,
      };
      expect(validateRelayConfig(config)).toEqual(config);
    });

    it.each([
      [{}, 'URL du relais requise'],
      [{ url: 'ftp://192.168.1.50/open' }, 'seuls les protocoles http et https'],
      [{ url: 'http://admin:pw@192.168.1.50/open' }, "retirez l'identifiant"],
      [{ url: 'not a url' }, 'URL invalide'],
      [{ url: `http://relay/${'a'.repeat(2100)}` }, 'URL trop longue'],
      [{ url: 'http://relay/open', method: 'DELETE' }, 'GET, POST ou PUT'],
      [{ url: 'http://relay/open', headers: 'Authorization: x' }, 'En-têtes HTTP'],
      [{ url: 'http://relay/open', headers: { 'Bad Name': 'x' } }, 'En-têtes HTTP'],
      [{ url: 'http://relay/open', headers: { 'X-A': 'line\r\nInjected: 1' } }, 'En-têtes HTTP'],
      [{ url: 'http://relay/open', headers: { 'X-A': { nested: 1 } } }, 'En-têtes HTTP'],
      [{ url: 'http://relay/open', basicAuth: { username: 'a:b', password: 'x' } }, 'Authentification du relais'],
      [{ url: 'http://relay/open', basicAuth: 'admin:pw' }, 'Authentification du relais'],
      [{ url: 'http://relay/open', body: 42 }, 'Corps de requête'],
      [{ url: 'http://relay/open', timeoutMs: 60_000 }, 'Délai du relais'],
    ])('refuses %j', (config, message) => {
      expect(() => validateRelayConfig(config as Record<string, unknown>)).toThrow(BadRequestException);
      expect(() => validateRelayConfig(config as Record<string, unknown>)).toThrow(message);
    });
  });

  describe('buildRelayRequest', () => {
    it('fills the placeholders in url, headers and body, like the door agent', () => {
      expect(
        buildRelayRequest(
          {
            url: 'http://192.168.1.60/open/{doorId}?s={seconds}&ms={ms}',
            method: 'POST',
            headers: { 'X-Seconds': '{seconds}' },
            body: { seconds: '{seconds}' },
          },
          values,
        ),
      ).toEqual({
        url: `http://192.168.1.60/open/${values.doorId}?s=7&ms=7000`,
        method: 'POST',
        headers: { 'X-Seconds': '7', 'Content-Type': 'application/json' },
        body: '{"seconds":"7"}',
        timeoutMs: 5000,
      });
    });

    it('turns basicAuth into an Authorization header that replaces any other', () => {
      const request = buildRelayRequest(
        { url: 'http://relay/open', headers: { authorization: 'old' }, basicAuth: { username: 'admin', password: 'pw' } },
        values,
      );
      expect(request.headers).toEqual({ Authorization: `Basic ${Buffer.from('admin:pw').toString('base64')}` });
    });

    it('sends no body with GET and keeps a text body as typed', () => {
      expect(buildRelayRequest({ url: 'http://relay/open', body: 'x' }, values).body).toBeUndefined();
      const put = buildRelayRequest({ url: 'http://relay/open', method: 'PUT', body: 'open={seconds}' }, values);
      expect(put.body).toBe('open=7');
      expect(put.headers).toEqual({});
    });

    it('throws on a config that would be refused on save', () => {
      expect(() => buildRelayRequest({ url: 'file:///etc/passwd' }, values)).toThrow(BadRequestException);
    });
  });

  it('fillPlaceholders encodes the door id', () => {
    expect(fillPlaceholders('{doorId}/{seconds}/{ms}', { seconds: 2, doorId: 'a b' })).toBe('a%20b/2/2000');
  });
});
