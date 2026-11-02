import { BadRequestException } from '@nestjs/common';
import { DOOR_SECRET_MASK } from '@app/common';

/**
 * Door config secrets (security review, finding 6). The back-office gets the config with every
 * secret replaced by DOOR_SECRET_MASK and sends it back as is when a door is edited: the mask
 * then means "keep the stored value". Door agents still receive the real config.
 */

/** Config keys holding a secret, at any depth: password / pwd, commKey, apiToken, basicAuth, door pin or code... */
const SECRET_KEY = /pass(word)?|pwd|secret|token|key|auth|pin|code/i;

/** Inside an object under a secret key (basicAuth), these say who, not how: kept visible. */
const IDENTITY_KEY = /^(user(name)?|login)$/i;

/** The mask as some clients percent-encode it in a URL. */
const ENCODED_MASK = '%2A'.repeat(DOOR_SECRET_MASK.length);

type Values = Record<string, unknown>;

function isPlainObject(value: unknown): value is Values {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function maskLeaf(value: unknown): unknown {
  if (typeof value === 'string') return value === '' ? value : DOOR_SECRET_MASK;
  if (typeof value === 'number') return DOOR_SECRET_MASK;
  return value; // booleans and null hold no secret
}

/** Every value masked (header values, lists under a secret key). */
function maskAll(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskAll);
  if (isPlainObject(value)) return mapValues(value, (_key, item) => maskAll(item));
  return maskLeaf(value);
}

/** Object under a secret key: everything masked except the identity fields (basicAuth.username). */
function maskSecretObject(object: Values): Values {
  return mapValues(object, (key, item) => {
    if (isPlainObject(item)) return maskSecretObject(item);
    if (IDENTITY_KEY.test(key) && !Array.isArray(item)) return item;
    return maskAll(item);
  });
}

function maskObject(object: Values): Values {
  return mapValues(object, (key, item) => {
    if (key === 'headers') return maskAll(item);
    if (SECRET_KEY.test(key)) return isPlainObject(item) ? maskSecretObject(item) : maskAll(item);
    if (key === 'url' && typeof item === 'string') return maskUrlSecrets(item);
    return maskNested(item);
  });
}

/** Value under a key that is no secret: the objects it holds, in lists of lists too, are masked by their own keys. */
function maskNested(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskNested);
  return isPlainObject(value) ? maskObject(value) : value;
}

function mapValues(object: Values, map: (key: string, value: unknown) => unknown): Values {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, map(key, value)]));
}

/** Door config as shown to the back-office: same shape, every secret replaced by DOOR_SECRET_MASK. */
export function maskDoorConfig(config: Values | null | undefined): Values {
  return isPlainObject(config) ? maskObject(config) : {};
}

interface QueryParam {
  name: string;
  value: string;
  /** Position of the value in the URL. */
  start: number;
  end: number;
}

/** name=value pairs of the query string, read as typed (placeholders such as {seconds} stay intact). */
function queryParams(url: string): QueryParam[] {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return [];
  const hash = url.indexOf('#', queryStart);
  const queryEnd = hash === -1 ? url.length : hash;
  const params: QueryParam[] = [];
  let position = queryStart + 1;
  for (const pair of url.slice(queryStart + 1, queryEnd).split('&')) {
    const equals = pair.indexOf('=');
    if (equals > 0) {
      params.push({
        name: decodeName(pair.slice(0, equals)),
        value: pair.slice(equals + 1),
        start: position + equals + 1,
        end: position + pair.length,
      });
    }
    position += pair.length + 1;
  }
  return params;
}

function decodeName(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return raw;
  }
}

function replaceValues(url: string, replacements: { param: QueryParam; value: string }[]): string {
  let result = url;
  // From the end, so the earlier positions stay valid.
  for (const { param, value } of [...replacements].sort((a, b) => b.param.start - a.param.start)) {
    result = result.slice(0, param.start) + value + result.slice(param.end);
  }
  return result;
}

/**
 * user:password@ of a URL saved before credentials were refused in relay URLs. As for a browser,
 * the last @ before the path ends the credentials, so a password holding "@" is masked whole.
 */
const URL_PASSWORD = /^([a-z][a-z0-9+.-]*:\/\/[^/?#\\:]*:)([^/?#\\]+)@/i;

/**
 * Relay URL with the values of secret query parameters (password=, token=, auth_key=...) masked,
 * and the password of a legacy user:password@ (refused on save, so it has to be moved to basicAuth).
 */
export function maskUrlSecrets(url: string): string {
  const secrets = queryParams(url).filter((param) => param.value !== '' && SECRET_KEY.test(param.name));
  const masked = replaceValues(url, secrets.map((param) => ({ param, value: DOOR_SECRET_MASK })));
  return masked.replace(URL_PASSWORD, `$1${DOOR_SECRET_MASK}@`);
}

function isMask(value: string): boolean {
  return value === DOOR_SECRET_MASK || value.toUpperCase() === ENCODED_MASK;
}

function missingSecret(path: string): BadRequestException {
  return new BadRequestException(
    `Secret masqué « ${DOOR_SECRET_MASK} » sans valeur enregistrée (${path}) : saisissez la valeur.`,
  );
}

/** Puts the stored values back into the masked query parameters of a relay URL. */
function restoreUrlSecrets(url: string, stored: unknown, path: string): string {
  const masked = queryParams(url).filter((param) => isMask(param.value));
  if (masked.length === 0) return url;
  const storedParams = typeof stored === 'string' ? queryParams(stored) : [];
  const seen = new Map<string, number>();
  const replacements = masked.map((param) => {
    // n-th occurrence of the name in the new URL ↔ n-th occurrence in the stored one.
    const index = seen.get(param.name) ?? 0;
    seen.set(param.name, index + 1);
    const original = storedParams.filter((candidate) => candidate.name === param.name)[index];
    if (!original || isMask(original.value)) throw missingSecret(`${path} (paramètre ${param.name})`);
    return { param, value: original.value };
  });
  return replaceValues(url, replacements);
}

function restore(value: unknown, stored: unknown, key: string, path: string): unknown {
  if (value === DOOR_SECRET_MASK) {
    const usable = (typeof stored === 'string' && stored !== DOOR_SECRET_MASK) || typeof stored === 'number';
    if (!usable) throw missingSecret(path);
    return stored;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      restore(item, Array.isArray(stored) ? stored[index] : undefined, key, `${path}[${index}]`),
    );
  }
  if (isPlainObject(value)) {
    return mapValues(value, (childKey, item) =>
      restore(item, isPlainObject(stored) ? stored[childKey] : undefined, childKey, `${path}.${childKey}`),
    );
  }
  if (key === 'url' && typeof value === 'string') return restoreUrlSecrets(value, stored, path);
  return value;
}

/**
 * Config received on a create / update, with each DOOR_SECRET_MASK replaced by the stored value at
 * the same place (`stored` is null on a create). BadRequestException when nothing is stored there.
 */
export function restoreMaskedSecrets(config: Values, stored: Values | null | undefined): Values {
  return restore(config, isPlainObject(stored) ? stored : undefined, '', 'config') as Values;
}
