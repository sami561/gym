import express from 'express';
import { DEFAULT_TRUST_PROXY, parseTrustProxy } from './trust-proxy';

describe('parseTrustProxy', () => {
  it('trusts the private networks (Docker, nginx) by default', () => {
    const presets = ['loopback', 'linklocal', 'uniquelocal'];
    expect(parseTrustProxy(undefined)).toEqual(presets);
    expect(parseTrustProxy('  ')).toEqual(presets);
    expect(parseTrustProxy(DEFAULT_TRUST_PROXY)).toEqual(presets);
  });

  it('reads booleans and hop counts', () => {
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('0')).toBe(false);
    expect(parseTrustProxy('TRUE')).toBe(true);
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy(' 2 ')).toBe(2);
  });

  it('splits a list of addresses, subnets and presets', () => {
    expect(parseTrustProxy('10.0.0.0/8, 172.18.0.5,,loopback')).toEqual(['10.0.0.0/8', '172.18.0.5', 'loopback']);
  });

  it('makes Express trust nginx on the Docker network but not a client on the Internet', () => {
    const app = express();
    app.set('trust proxy', parseTrustProxy(undefined));
    const trusted = app.get('trust proxy fn') as (address: string, hop: number) => boolean;
    expect(trusted('172.18.0.4', 0)).toBe(true);
    expect(trusted('::ffff:172.18.0.4', 0)).toBe(true);
    expect(trusted('127.0.0.1', 0)).toBe(true);
    expect(trusted('203.0.113.7', 0)).toBe(false);
    expect(trusted('::ffff:203.0.113.7', 0)).toBe(false);
  });

  it('lets Express refuse an entry that is not an address (fails at startup)', () => {
    expect(() => express().set('trust proxy', parseTrustProxy('web'))).toThrow('invalid IP address: web');
  });
});
