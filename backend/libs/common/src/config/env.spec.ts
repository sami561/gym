import { csvEnv, env, envBool, envFloat, envInt } from './env';

// Never read the developer's backend/.env in a unit test.
jest.mock('dotenv', () => ({ config: jest.fn() }));

const KEY = 'MELIORA_ENV_SPEC_VALUE';

describe('env readers', () => {
  afterEach(() => {
    delete process.env[KEY];
  });

  describe('env', () => {
    it('returns the value, else the fallback, else fails naming the variable', () => {
      process.env[KEY] = 'redis';
      expect(env(KEY, 'fallback')).toBe('redis');
      process.env[KEY] = '';
      expect(env(KEY, 'fallback')).toBe('fallback');
      delete process.env[KEY];
      expect(env(KEY, '')).toBe('');
      expect(() => env(KEY)).toThrow(`Missing required environment variable ${KEY}`);
    });
  });

  describe('envInt / envFloat', () => {
    it('parse numbers and fall back on missing or invalid values', () => {
      expect(envInt(KEY, 3)).toBe(3);
      process.env[KEY] = '';
      expect(envInt(KEY, 3)).toBe(3);
      process.env[KEY] = 'abc';
      expect(envInt(KEY, 3)).toBe(3);
      process.env[KEY] = '14';
      expect(envInt(KEY, 3)).toBe(14);
      process.env[KEY] = '-1';
      expect(envInt(KEY, 3)).toBe(-1);
      process.env[KEY] = '0.25';
      expect(envFloat(KEY, 1)).toBe(0.25);
      process.env[KEY] = 'n/a';
      expect(envFloat(KEY, 1)).toBe(1);
    });
  });

  describe('envBool', () => {
    it.each(['1', 'true', 'TRUE', 'yes', 'On'])('reads %p as true', (raw) => {
      process.env[KEY] = raw;
      expect(envBool(KEY, false)).toBe(true);
    });

    it.each(['0', 'false', 'no', 'off', 'enabled'])('reads %p as false', (raw) => {
      process.env[KEY] = raw;
      expect(envBool(KEY, true)).toBe(false);
    });

    it('uses the fallback when unset or empty', () => {
      expect(envBool(KEY, true)).toBe(true);
      process.env[KEY] = '';
      expect(envBool(KEY, true)).toBe(true);
    });
  });

  describe('csvEnv', () => {
    it('splits, trims and drops empty entries', () => {
      process.env[KEY] = ' 192.168.1.0/24, ,10.0.0.0/8 ,, n8n ';
      expect(csvEnv(KEY)).toEqual(['192.168.1.0/24', '10.0.0.0/8', 'n8n']);
    });

    it('is empty when unset', () => {
      expect(csvEnv(KEY)).toEqual([]);
    });
  });
});
