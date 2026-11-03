import { RedactingQueryLogger, redactParam } from './query-logger';

describe('RedactingQueryLogger (TypeORM logger of every service)', () => {
  const photo = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66]);
  const memberId = '0b9a2c6e-6f1d-4c39-9a51-3d2f8e7c1a01';
  let printed: jest.SpyInstance;

  beforeEach(() => {
    printed = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => printed.mockRestore());

  const output = () => printed.mock.calls.flat().map(String).join('\n');

  it('logs a failed query with its ids and dates, a photo only as its size', () => {
    const logger = new RedactingQueryLogger(['error']);
    logger.logQueryError(
      'insert or update on table "member_photos" violates foreign key constraint',
      'INSERT INTO "member_photos"("memberId", "data", "updatedAt") VALUES ($1, $2, $3)',
      [memberId, photo, '2026-11-03T09:00:00.000Z'],
    );
    expect(output()).toContain('INSERT INTO "member_photos"');
    expect(output()).toContain(`"${memberId}","<binary 10 bytes>","2026-11-03T09:00:00.000Z"`);
    expect(output()).not.toContain('Buffer');
    expect(output()).not.toContain('255,216');
  });

  // An access_members upsert that failed once printed the member's QR secret in access-service.log.
  it('never prints secrets, names or e-mails of a failed query', () => {
    const secret = 'f3a9c1d2e4b5a6978877665544332211ffeeddccbbaa99887766554433221100';
    new RedactingQueryLogger(['error']).logQueryError(
      'duplicate key value violates unique constraint',
      'INSERT INTO "access_members"("id", "memberCode", "accessSecret", "name", "email") VALUES ($1, $2, $3, $4, $5)',
      [memberId, 'MEL-00031', secret, 'Amira Jaziri', 'amira.jaziri1@example.com'],
    );
    expect(output()).toContain(memberId);
    expect(output()).toContain('"<text 64>"');
    for (const leaked of [secret, 'MEL-00031', 'Amira', 'example.com']) expect(output()).not.toContain(leaked);
  });

  it('redacts with DB_LOGGING too, and logs nothing that was not asked', () => {
    new RedactingQueryLogger(['query', 'error', 'warn']).logQuery('SELECT 1 WHERE $1 IS NOT NULL AND $2 = $3', [photo, 'secret', 3]);
    expect(output()).toContain('["<binary 10 bytes>","<text 6>",3]');
    printed.mockClear();
    new RedactingQueryLogger(['error']).logQuery('SELECT 1 WHERE $1 IS NOT NULL', [photo]);
    expect(printed).not.toHaveBeenCalled();
  });

  it('keeps ids, dates, numbers, booleans and null; hides text, json and bytes', () => {
    expect(redactParam(memberId)).toBe(memberId);
    expect(redactParam('2026-11-03')).toBe('2026-11-03');
    expect(redactParam('2026-11-03 09:00:00+01')).toBe('2026-11-03 09:00:00+01');
    const at = new Date('2026-11-03T08:00:00Z');
    expect(redactParam(at)).toBe(at);
    expect(redactParam(42)).toBe(42);
    expect(redactParam(true)).toBe(true);
    expect(redactParam(null)).toBeNull();
    expect(redactParam(undefined)).toBeUndefined();
    expect(redactParam('$2b$10$abcdefghijklmnopqrstuv')).toBe('<text 29>');
    expect(redactParam({ latitude: 35.8, longitude: 10.6 })).toBe('<object>');
    expect(redactParam([memberId, 'Amira'])).toEqual([memberId, '<text 5>']);
    expect(redactParam(new Uint8Array(3))).toBe('<binary 3 bytes>');
  });
});
