import * as bcrypt from 'bcryptjs';

export const BCRYPT_ROUNDS = 10;

/**
 * bcrypt hash, same cost as real ones, of a random value nobody knows. Login compares against it when
 * the e-mail is unknown, so an unknown account costs the same bcrypt work as a wrong password.
 */
export const DUMMY_PASSWORD_HASH = '$2b$10$ENaGd2LBK6UM4qKWa4xKReFgPRauIyzT71gMekI7L4Q9VoP7phBzq';

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** Always runs bcrypt, against the dummy hash when there is no account; never true without one. */
export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  const matches = await bcrypt.compare(password, hash ?? DUMMY_PASSWORD_HASH);
  return matches && !!hash;
}
