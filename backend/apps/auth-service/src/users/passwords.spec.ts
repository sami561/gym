import * as bcrypt from 'bcryptjs';
import { BCRYPT_ROUNDS, DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './passwords';

// Real bcrypt, with compare observable.
jest.mock('bcryptjs', () => {
  const actual = jest.requireActual('bcryptjs');
  return { ...actual, compare: jest.fn((password: string, hash: string) => actual.compare(password, hash)) };
});

describe('passwords', () => {
  const compare = bcrypt.compare as unknown as jest.Mock;

  beforeEach(() => compare.mockClear());

  it('the dummy hash costs as much as a real one', async () => {
    expect(bcrypt.getRounds(DUMMY_PASSWORD_HASH)).toBe(BCRYPT_ROUNDS);
    expect(bcrypt.getRounds(await hashPassword('Meliora-test-1'))).toBe(BCRYPT_ROUNDS);
  });

  it('verifies a password against its hash', async () => {
    const hash = await hashPassword('Meliora-test-1');
    await expect(verifyPassword('Meliora-test-1', hash)).resolves.toBe(true);
    await expect(verifyPassword('Meliora-test-2', hash)).resolves.toBe(false);
  });

  it('still runs bcrypt without an account, and never succeeds', async () => {
    await expect(verifyPassword('anything', undefined)).resolves.toBe(false);
    await expect(verifyPassword('anything', null)).resolves.toBe(false);
    expect(compare).toHaveBeenCalledTimes(2);
    expect(compare).toHaveBeenCalledWith('anything', DUMMY_PASSWORD_HASH);
  });
});
