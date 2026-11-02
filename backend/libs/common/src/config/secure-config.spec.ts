import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { assertSecureConfig } from './secure-config';

const BACKEND = path.resolve(__dirname, '../../../..');
const REPO = path.resolve(BACKEND, '..');

const JWT_KEYS = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
const KEYS = [...JWT_KEYS, 'AUTOMATION_API_KEY', 'WEBHOOK_SECRET', 'WEBHOOK_AUTH_TOKEN', 'NATS_TOKEN'];
const PASSWORDS = ['ADMIN_PASSWORD', 'DB_PASSWORD', 'REDIS_PASSWORD'];
const ENV_READ = /(?:\b(?:env|envInt|envFloat|envBool|csvEnv)\(\s*['"`]|process\.env\.|process\.env\[\s*['"`])([A-Z][A-Z0-9_]*)/g;

/** Random hex string of exactly `length` characters. */
const randomValue = (length: number) => randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
const prod = (vars: Record<string, string | undefined> = {}) => ({ NODE_ENV: 'production', ...vars });

/** Message thrown by assertSecureConfig, '' when the config is accepted. */
function failure(source: Record<string, string | undefined>): string {
  try {
    assertSecureConfig(source);
  } catch (err) {
    return (err as Error).message;
  }
  return '';
}

const isCovered = (name: string) => failure(prod({ [name]: 'change-me' })).includes(`${name} (`);

function parseEnvFile(file: string): [string, string][] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .flatMap((line): [string, string][] => {
      const match = /^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$/.exec(line);
      if (!match) return [];
      const raw = match[2].trim();
      const quoted = /^(['"])(.*)\1$/.exec(raw);
      return [[match[1], quoted ? quoted[2] : raw.replace(/\s+#.*$/, '')]];
    });
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [full] : [];
  });
}

describe('assertSecureConfig', () => {
  const strongConfig = () => ({
    ...Object.fromEntries(KEYS.map((name) => [name, randomValue(64)])),
    ...Object.fromEntries(PASSWORDS.map((name) => [name, randomValue(20)])),
    EXPO_ACCESS_TOKEN: randomValue(40),
  });

  it.each([undefined, 'development', 'test', 'staging'])('does nothing when NODE_ENV is %p', (nodeEnv) => {
    expect(() =>
      assertSecureConfig({
        NODE_ENV: nodeEnv,
        JWT_ACCESS_SECRET: 'change-me-access-secret-at-least-32-characters',
        ADMIN_PASSWORD: 'admin',
      }),
    ).not.toThrow();
  });

  it('accepts strong secrets in production', () => {
    expect(failure(prod(strongConfig()))).toBe('');
  });

  it('skips the variables that are not set', () => {
    expect(failure(prod())).toBe('');
    expect(failure(prod({ WEBHOOK_SECRET: '', REDIS_PASSWORD: undefined }))).toBe('');
  });

  it('lists every problem by variable and reason, never the values', () => {
    const shortSecret = randomValue(31);
    const message = failure(
      prod({
        ...strongConfig(),
        JWT_ACCESS_SECRET: 'change-me-access-secret-at-least-32-characters',
        WEBHOOK_SECRET: shortSecret,
      }),
    );
    expect(message).toBe(
      "Configuration de production refusée : JWT_ACCESS_SECRET (valeur d'exemple), " +
        'WEBHOOK_SECRET (trop court : 32 caractères minimum). ' +
        'Générez chaque secret avec « openssl rand -hex 32 ».',
    );
    expect(message).not.toContain(shortSecret);
  });

  it('refuses the values of process.env by default', () => {
    const saved = process.env;
    process.env = { NODE_ENV: 'production', AUTOMATION_API_KEY: 'change-me-automation-key' };
    try {
      expect(() => assertSecureConfig()).toThrow(
        "AUTOMATION_API_KEY (valeur d'exemple, trop court : 32 caractères minimum)",
      );
    } finally {
      process.env = saved;
    }
  });

  it.each(['change-me', 'changeme', 'CHANGEME', 'Change_Me'])('refuses %s in any position', (marker) => {
    const filler = '0123456789abcdef'.repeat(2);
    for (const value of [marker + filler, filler + marker, `${filler}-${marker}-${filler}`]) {
      expect(failure(prod({ JWT_REFRESH_SECRET: value }))).toBe(
        "Configuration de production refusée : JWT_REFRESH_SECRET (valeur d'exemple). " +
          'Générez chaque secret avec « openssl rand -hex 32 ».',
      );
    }
  });

  it.each(['dev-', 'DEV-', 'Dev-'])('refuses values starting with %s', (prefix) => {
    expect(failure(prod({ NATS_TOKEN: prefix + randomValue(40) }))).toContain('NATS_TOKEN (valeur de développement)');
  });

  it.each(['secret', 'password', 'admin', 'PASSWORD', 'Admin'])('refuses the trivial value %p', (value) => {
    expect(failure(prod({ REDIS_PASSWORD: value }))).toContain(
      'REDIS_PASSWORD (valeur trop simple, trop court : 12 caractères minimum)',
    );
  });

  it('refuses the example admin password in any variable', () => {
    expect(failure(prod({ ADMIN_PASSWORD: 'Meliora2026!' }))).toContain("ADMIN_PASSWORD (valeur d'exemple)");
    expect(failure(prod({ DB_PASSWORD: 'Meliora2026!' }))).toContain('DB_PASSWORD (valeur trop simple)');
  });

  it.each(KEYS)('needs 32 characters for %s', (name) => {
    expect(failure(prod({ [name]: randomValue(31) }))).toContain(`${name} (trop court : 32 caractères minimum)`);
    expect(failure(prod({ [name]: randomValue(32) }))).toBe('');
  });

  it.each(PASSWORDS)('needs 12 characters for %s', (name) => {
    expect(failure(prod({ [name]: randomValue(11) }))).toContain(`${name} (trop court : 12 caractères minimum)`);
    expect(failure(prod({ [name]: randomValue(12) }))).toBe('');
  });

  it('only applies the placeholder checks to the Expo token (issued by Expo)', () => {
    expect(failure(prod({ EXPO_ACCESS_TOKEN: 'abc123' }))).toBe('');
    expect(failure(prod({ EXPO_ACCESS_TOKEN: 'change-me' }))).toContain("EXPO_ACCESS_TOKEN (valeur d'exemple)");
  });

  it('refuses WEBHOOK_AUTH_TOKEN equal to WEBHOOK_SECRET', () => {
    const shared = randomValue(64);
    const message = failure(prod({ WEBHOOK_SECRET: shared, WEBHOOK_AUTH_TOKEN: shared }));
    expect(message).toContain('WEBHOOK_AUTH_TOKEN (identique à WEBHOOK_SECRET)');
    expect(message).not.toContain('WEBHOOK_SECRET (');
    expect(failure(prod({ WEBHOOK_SECRET: shared, WEBHOOK_AUTH_TOKEN: randomValue(64) }))).toBe('');
  });

  it('refuses JWT_REFRESH_SECRET equal to JWT_ACCESS_SECRET', () => {
    const shared = randomValue(64);
    expect(failure(prod({ JWT_ACCESS_SECRET: shared, JWT_REFRESH_SECRET: shared }))).toContain(
      'JWT_REFRESH_SECRET (identique à JWT_ACCESS_SECRET)',
    );
  });

  it('refuses a value reused by any two secrets, reported on the later ones', () => {
    // n8n holds AUTOMATION_API_KEY and saves WEBHOOK_AUTH_TOKEN with every execution: neither may be a JWT secret.
    const shared = randomValue(64);
    expect(
      failure(prod({ ...strongConfig(), JWT_ACCESS_SECRET: shared, AUTOMATION_API_KEY: shared, WEBHOOK_AUTH_TOKEN: shared })),
    ).toBe(
      'Configuration de production refusée : AUTOMATION_API_KEY (identique à JWT_ACCESS_SECRET), ' +
        'WEBHOOK_AUTH_TOKEN (identique à JWT_ACCESS_SECRET). Générez chaque secret avec « openssl rand -hex 32 ».',
    );
    expect(failure(prod({ ...strongConfig(), JWT_REFRESH_SECRET: shared, NATS_TOKEN: shared }))).toContain(
      'NATS_TOKEN (identique à JWT_REFRESH_SECRET)',
    );
    const password = randomValue(20);
    expect(failure(prod({ ...strongConfig(), DB_PASSWORD: password, REDIS_PASSWORD: password }))).toContain(
      'REDIS_PASSWORD (identique à DB_PASSWORD)',
    );
  });

  it('checks the password inside <PREFIX>_DATABASE_URL', () => {
    expect(failure(prod({ ACCESS_DATABASE_URL: 'postgres://meliora:postgres@db:5432/meliora_access' }))).toContain(
      "ACCESS_DATABASE_URL (mot de passe : valeur d'exemple, trop court : 12 caractères minimum)",
    );
    const strong = encodeURIComponent(`${randomValue(20)}@/#`);
    expect(failure(prod({ ACCESS_DATABASE_URL: `postgres://meliora:${strong}@db:5432/meliora_access` }))).toBe('');
    expect(failure(prod({ ACCESS_DATABASE_URL: 'postgres://db:5432/meliora_access' }))).toBe('');
    expect(failure(prod({ ACCESS_DATABASE_URL: 'not a url' }))).toBe('');
  });

  it('refuses every secret value shipped in the .env.example files', () => {
    // docker-compose passes the root POSTGRES_PASSWORD to the services as DB_PASSWORD.
    const aliases: Record<string, string> = { POSTGRES_PASSWORD: 'DB_PASSWORD' };
    const checked = new Set<string>();
    for (const file of [path.join(BACKEND, '.env.example'), path.join(REPO, '.env.example')]) {
      for (const [rawName, value] of parseEnvFile(file)) {
        const name = aliases[rawName] ?? rawName;
        if (!value || !isCovered(name)) continue;
        const message = failure(prod({ [name]: value }));
        expect({ file, name, refused: message.includes(`${name} (`) }).toEqual({ file, name, refused: true });
        expect(message).not.toContain(value);
        checked.add(name);
      }
    }
    expect([...checked]).toEqual(
      expect.arrayContaining([...JWT_KEYS, 'AUTOMATION_API_KEY', 'WEBHOOK_SECRET', 'ADMIN_PASSWORD', 'DB_PASSWORD']),
    );
  });

  it('covers every secret env var the backend reads', () => {
    const names = new Set<string>();
    for (const file of [...sourceFiles(path.join(BACKEND, 'apps')), ...sourceFiles(path.join(BACKEND, 'libs'))]) {
      for (const match of fs.readFileSync(file, 'utf8').matchAll(ENV_READ)) names.add(match[1]);
    }
    const secrets = [...names].filter((name) => /SECRET|PASSWORD|TOKEN|KEY/.test(name)).sort();
    expect(secrets).toEqual(expect.arrayContaining(['JWT_ACCESS_SECRET', 'AUTOMATION_API_KEY', 'DB_PASSWORD']));
    expect(secrets.filter((name) => !isCovered(name))).toEqual([]);
  });
});

describe('loadEnv', () => {
  const savedEnv = process.env;
  const savedCwd = process.cwd();

  beforeEach(() => {
    // No .env file here: only the variables set by each test are loaded.
    process.chdir(__dirname);
  });

  afterEach(() => {
    process.chdir(savedCwd);
    process.env = savedEnv;
  });

  it('refuses an unsafe production config, on every call', () => {
    process.env = { NODE_ENV: 'production', JWT_ACCESS_SECRET: 'change-me-access-secret-at-least-32-characters' };
    jest.isolateModules(() => {
      const { env, loadEnv } = require('./env') as typeof import('./env');
      expect(() => loadEnv()).toThrow("Configuration de production refusée : JWT_ACCESS_SECRET (valeur d'exemple)");
      expect(() => env('JWT_ACCESS_SECRET')).toThrow('Configuration de production refusée');
    });
  });

  it('loads a development config that still uses the example values', () => {
    process.env = { NODE_ENV: 'development', JWT_ACCESS_SECRET: 'change-me-access-secret-at-least-32-characters' };
    jest.isolateModules(() => {
      const { env } = require('./env') as typeof import('./env');
      expect(env('JWT_ACCESS_SECRET')).toBe('change-me-access-secret-at-least-32-characters');
    });
  });
});
