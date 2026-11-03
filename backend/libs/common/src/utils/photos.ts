import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { PHOTO_ERRORS, PHOTO_MAX_BYTES } from '../contracts/photo.contracts';

/** Length of the base64 text of PHOTO_MAX_BYTES bytes: longer texts are refused before decoding. */
const MAX_BASE64_LENGTH = Math.ceil(PHOTO_MAX_BYTES / 3) * 4;

/**
 * The uploaded bytes of a SetPhotoRequest (`data`, base64): 400 without data, 413 above PHOTO_MAX_BYTES (the
 * gateway already limits the size; checked again by the service). Then `stripJpegMetadata` checks the JPEG.
 */
export function decodePhotoUpload(data: unknown): Buffer {
  if (typeof data !== 'string' || !data) throw new BadRequestException(PHOTO_ERRORS.missing);
  if (data.length > MAX_BASE64_LENGTH) throw new PayloadTooLargeException(PHOTO_ERRORS.tooLarge);
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length > PHOTO_MAX_BYTES) throw new PayloadTooLargeException(PHOTO_ERRORS.tooLarge);
  return bytes;
}

/**
 * Instant of a new upload: `now`, or 1 ms after the previous upload when the clock has not passed it, so that
 * every upload gets a new version (`?v=`) and no browser keeps the previous photo under the new URL.
 */
export function nextPhotoVersion(previous: Date | null | undefined, now: Date): Date {
  return previous && previous.getTime() >= now.getTime() ? new Date(previous.getTime() + 1) : now;
}

const COACH_PHOTO_PATH =
  /^\/api\/public\/coaches\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/photo(?:\?v=\d+)?$/i;

/**
 * `avatarUrl` of a coach once a photo file is uploaded (docs/API.md, Coach photos): the public route of the
 * photo, versioned by the upload instant in epoch ms. Relative: the website and the back-office are served
 * from the same origin as the API.
 */
export function coachPhotoUrl(userId: string, uploadedAt: Date): string {
  return `/api/public/coaches/${userId}/photo?v=${uploadedAt.getTime()}`;
}

/** The user id of a URL written by coachPhotoUrl (any version, or none), null for any other value. */
export function coachPhotoOwner(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const match = COACH_PHOTO_PATH.exec(url);
  return match ? match[1].toLowerCase() : null;
}
