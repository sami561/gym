/**
 * Production guard against example and weak secrets (security review, finding 8).
 * loadEnv() runs it right after backend/.env is loaded, so the gateway and every
 * service refuse to start with NODE_ENV=production and a secret copied from an
 * .env.example file. Outside production (development, jest's "test") it does nothing.
 */

/** key: signing keys, API keys and bus tokens; external: issued by a third party (format not ours). */
type SecretKind = 'key' | 'password' | 'external';

/** Secret env vars read by the backend, in the order problems are reported. */
const SECRETS: [name: string, kind: SecretKind][] = [
  ['JWT_ACCESS_SECRET', 'key'],
  ['JWT_REFRESH_SECRET', 'key'],
  ['AUTOMATION_API_KEY', 'key'],
  ['WEBHOOK_SECRET', 'key'],
  ['WEBHOOK_AUTH_TOKEN', 'key'],
  ['NATS_TOKEN', 'key'],
  ['ADMIN_PASSWORD', 'password'],
  ['DB_PASSWORD', 'password'],
  ['REDIS_PASSWORD', 'password'],
  ['EXPO_ACCESS_TOKEN', 'external'],
];

const MIN_LENGTH: Record<SecretKind, number> = { key: 32, password: 12, external: 0 };

/**
 * Values shipped in backend/.env.example and the root .env.example (docker-compose passes
 * POSTGRES_PASSWORD as DB_PASSWORD). secure-config.spec.ts reads both files and fails when
 * one of their values would be accepted.
 */
const EXAMPLE_VALUES: Record<string, string[]> = {
  JWT_ACCESS_SECRET: ['change-me-access-secret-at-least-32-characters'],
  JWT_REFRESH_SECRET: ['change-me-refresh-secret-at-least-32-characters'],
  AUTOMATION_API_KEY: ['change-me-automation-key'],
  WEBHOOK_SECRET: ['change-me-webhook-signing-secret', 'change-me-webhook-secret'],
  ADMIN_PASSWORD: ['Meliora2026!', 'change-me-admin-password'],
  DB_PASSWORD: ['postgres', 'change-me-postgres'],
};

const TRIVIAL_VALUES = new Set(['secret', 'password', 'admin', 'meliora2026!']);

/**
 * First variable of SECRETS listed before `index` that already holds `value`. No value may serve two
 * variables: n8n saves WEBHOOK_AUTH_TOKEN with every execution and holds AUTOMATION_API_KEY and
 * WEBHOOK_SECRET, so a shared value would hand its editors the signing key or a JWT secret; a
 * refresh token would pass as an access token.
 */
function sharedWith(source: Record<string, string | undefined>, index: number, value: string): string | undefined {
  return SECRETS.slice(0, index).find(([other]) => source[other] === value)?.[0];
}

function weaknesses(value: string, kind: SecretKind, examples: string[]): string[] {
  const reasons: string[] = [];
  if (examples.includes(value) || /change[-_]?me/i.test(value)) reasons.push("valeur d'exemple");
  else if (/^dev-/i.test(value)) reasons.push('valeur de développement');
  else if (TRIVIAL_VALUES.has(value.toLowerCase())) reasons.push('valeur trop simple');
  if (value.length < MIN_LENGTH[kind]) reasons.push(`trop court : ${MIN_LENGTH[kind]} caractères minimum`);
  return reasons;
}

function databaseUrlPassword(raw: string | undefined): string {
  if (!raw) return '';
  try {
    return decodeURIComponent(new URL(raw).password);
  } catch {
    return '';
  }
}

/**
 * No-op unless NODE_ENV=production. Then every secret that is set must not be an example
 * value (.env.example, change-me, dev-..., secret/password/admin), must be long enough
 * (keys and tokens 32 characters, passwords 12) and must not reuse the value of another
 * secret (reported on the later one). Throws one Error naming each variable and its
 * reasons, never the values.
 */
export function assertSecureConfig(source: Record<string, string | undefined> = process.env): void {
  if (source.NODE_ENV !== 'production') return;
  const problems: string[] = [];

  for (const [index, [name, kind]] of SECRETS.entries()) {
    const value = source[name];
    if (!value) continue;
    const reasons = weaknesses(value, kind, EXAMPLE_VALUES[name] ?? []);
    const shared = sharedWith(source, index, value);
    if (shared) reasons.push(`identique à ${shared}`);
    if (reasons.length) problems.push(`${name} (${reasons.join(', ')})`);
  }

  // <PREFIX>_DATABASE_URL replaces DB_PASSWORD for one service (database.module.ts).
  for (const name of Object.keys(source).filter((key) => key.endsWith('_DATABASE_URL')).sort()) {
    const password = databaseUrlPassword(source[name]);
    const reasons = password ? weaknesses(password, 'password', EXAMPLE_VALUES.DB_PASSWORD) : [];
    if (reasons.length) problems.push(`${name} (mot de passe : ${reasons.join(', ')})`);
  }

  if (problems.length) {
    throw new Error(
      `Configuration de production refusée : ${problems.join(', ')}. ` +
        'Générez chaque secret avec « openssl rand -hex 32 ».',
    );
  }
}
