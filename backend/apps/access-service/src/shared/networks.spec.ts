import { loadEnv } from '@app/common';
import { DEFAULT_RELAY_NETWORKS, readNetworkList } from './networks';

describe('readNetworkList', () => {
  const NAME = 'ACCESS_TEST_NETWORKS';

  beforeAll(() => loadEnv()); // backend/.env first, so the values below win
  afterEach(() => delete process.env[NAME]);

  it('reads a comma-separated list of IPs and CIDRs', () => {
    process.env[NAME] = ' 197.15.20.33 , 192.168.1.0/24,,2c0f:f698::/32 ';
    expect(readNetworkList(NAME)).toEqual({
      name: NAME,
      networks: ['197.15.20.33', '192.168.1.0/24', '2c0f:f698::/32'],
      error: null,
    });
  });

  it('falls back when the variable is unset or empty', () => {
    expect(readNetworkList(NAME, DEFAULT_RELAY_NETWORKS).networks).toEqual(['10.0.0.0/8', '192.168.0.0/16']);
    process.env[NAME] = '';
    expect(readNetworkList(NAME).networks).toEqual([]);
  });

  it('reports a malformed entry so callers can fail closed', () => {
    process.env[NAME] = '192.168.1.0/24, 192.168.1.300';
    expect(readNetworkList(NAME).error).toBe('Plage IP invalide dans la configuration : « 192.168.1.300 »');
  });
});
