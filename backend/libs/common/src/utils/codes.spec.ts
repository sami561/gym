import { formatMemberCode, fullName, generatePassword, randomSecret, sha256 } from './codes';

describe('codes and names', () => {
  it('formats member codes on 5 digits without truncating larger ones', () => {
    expect(formatMemberCode(1)).toBe('MEL-00001');
    expect(formatMemberCode(42)).toBe('MEL-00042');
    expect(formatMemberCode(123456)).toBe('MEL-123456');
  });

  it('joins first and last name, trimming a missing part', () => {
    expect(fullName({ firstName: 'Amira', lastName: 'Ben Salah' })).toBe('Amira Ben Salah');
    expect(fullName({ firstName: 'Amira', lastName: '' })).toBe('Amira');
    expect(fullName({ firstName: '', lastName: 'Trabelsi' })).toBe('Trabelsi');
  });

  it('generates temporary passwords without ambiguous characters', () => {
    const passwords = Array.from({ length: 200 }, () => generatePassword());
    for (const password of passwords) {
      expect(password).toHaveLength(10);
      expect(password).toMatch(/^[a-hjkmnp-zA-HJ-NP-Z2-9]+$/); // no 0/O, 1/l/I, i, o
    }
    expect(new Set(passwords).size).toBe(passwords.length);
    expect(generatePassword(16)).toHaveLength(16);
  });

  it('generates hex secrets of the requested size', () => {
    expect(randomSecret()).toMatch(/^[0-9a-f]{64}$/);
    expect(randomSecret(16)).toMatch(/^[0-9a-f]{32}$/);
    expect(randomSecret()).not.toBe(randomSecret());
  });

  it('hashes with SHA-256 in hex', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
