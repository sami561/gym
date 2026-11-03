import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { PHOTO_MAX_BYTES } from '../contracts/photo.contracts';
import { coachPhotoOwner, coachPhotoUrl, decodePhotoUpload, nextPhotoVersion } from './photos';

const NOW = new Date('2026-11-03T09:00:00.000Z');
const MISSING = new BadRequestException('Ajoutez une photo (champ « photo »).');
const TOO_LARGE = new PayloadTooLargeException('La photo dépasse 512 Ko.');
const COACH_ID = '3c5e8a52-4f0e-4c1e-9b7a-0a1b2c3d4e05';

describe('decodePhotoUpload', () => {
  it('decodes the base64 upload, 512 KB exactly included', () => {
    const limit = Buffer.alloc(PHOTO_MAX_BYTES, 0xff);
    expect(decodePhotoUpload(limit.toString('base64'))).toEqual(limit);
  });

  it('refuses one byte more', () => {
    expect(() => decodePhotoUpload(Buffer.alloc(PHOTO_MAX_BYTES + 1).toString('base64'))).toThrow(TOO_LARGE);
  });

  it('refuses base64 text longer than 512 KB of data without decoding it', () => {
    const tooLong = 'A'.repeat(Math.ceil(PHOTO_MAX_BYTES / 3) * 4 + 4);
    const from = jest.spyOn(Buffer, 'from');
    expect(() => decodePhotoUpload(tooLong)).toThrow(TOO_LARGE);
    expect(from).not.toHaveBeenCalled();
    from.mockRestore();
  });

  it('refuses what is not text', () => {
    for (const data of [undefined, null, 42, { photo: 'x' }, '']) expect(() => decodePhotoUpload(data)).toThrow(MISSING);
  });
});

it('nextPhotoVersion moves past the previous version', () => {
  expect(nextPhotoVersion(null, NOW)).toBe(NOW);
  expect(nextPhotoVersion(undefined, NOW)).toBe(NOW);
  expect(nextPhotoVersion(new Date('2026-11-03T08:00:00.000Z'), NOW)).toBe(NOW);
  expect(nextPhotoVersion(NOW, NOW).toISOString()).toBe('2026-11-03T09:00:00.001Z');
  expect(nextPhotoVersion(new Date('2026-11-03T09:00:10.000Z'), NOW).toISOString()).toBe('2026-11-03T09:00:10.001Z');
});

describe('coach photo URL', () => {
  it('is the public route versioned by the upload instant in epoch ms', () => {
    expect(coachPhotoUrl(COACH_ID, NOW)).toBe(`/api/public/coaches/${COACH_ID}/photo?v=${NOW.getTime()}`);
  });

  it('coachPhotoOwner reads the coach id back, whatever the version', () => {
    expect(coachPhotoOwner(coachPhotoUrl(COACH_ID, NOW))).toBe(COACH_ID);
    expect(coachPhotoOwner(`/api/public/coaches/${COACH_ID}/photo`)).toBe(COACH_ID);
    expect(coachPhotoOwner(`/api/public/coaches/${COACH_ID.toUpperCase()}/photo?v=1`)).toBe(COACH_ID);
  });

  it('coachPhotoOwner is null for any other value', () => {
    for (const value of [
      null,
      undefined,
      42,
      '',
      'https://cdn.example.com/coach.jpg',
      `https://evil.example.com/api/public/coaches/${COACH_ID}/photo?v=1`,
      `/api/public/coaches/${COACH_ID}/photo?v=1&x=2`,
      `/api/public/coaches/${COACH_ID}/photo?v=abc`,
      `/api/public/coaches/42/photo`,
      `/api/members/${COACH_ID}/photo`,
    ]) {
      expect(coachPhotoOwner(value)).toBeNull();
    }
  });
});
