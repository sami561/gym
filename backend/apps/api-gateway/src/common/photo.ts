import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
  applyDecorators,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { createHash } from 'crypto';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { PHOTO_ERRORS, PHOTO_MAX_BYTES, StoredPhoto } from '@app/common';

/**
 * Photo files on the HTTP side, shared by every photo route (docs/API.md, Member photos and Coach photos):
 * member photos in MembersController and MeController (membership-service), coach photos in UsersController
 * and PublicController (auth-service). The services check the JPEG and remove its metadata.
 */

export const PHOTO_FIELD = 'photo';

/**
 * Who may keep the answer: `private` (member photos, behind a token: the browser only) or `public` (coach
 * photos of the website: shared caches and nginx too).
 */
export type PhotoAudience = 'private' | 'public';

/**
 * Cache-Control of a photo. `?v=` names one version of the photo: cached for a year. Without `v` (access logs,
 * scanner): stored, but revalidated with If-None-Match every time.
 */
export function photoCacheControl(audience: PhotoAudience, version: string | undefined): string {
  return version ? `${audience}, max-age=31536000, immutable` : `${audience}, no-cache`;
}

/** The part of multer's file (memory storage) the gateway reads; spares a dependency on @types/multer. */
export interface UploadedPhoto {
  fieldname: string;
  size: number;
  buffer: Buffer;
}

/**
 * multipart/form-data, one file in `photo`, kept in memory; multer stops reading at PHOTO_MAX_BYTES.
 * A few short text fields are tolerated, anything bigger is refused.
 */
const MultipartPhoto = FileInterceptor(PHOTO_FIELD, {
  limits: { fileSize: PHOTO_MAX_BYTES, files: 1, fields: 5, fieldSize: 1024, parts: 6 },
});

/**
 * Reads the upload with FileInterceptor and gives its refusals the French messages of the contract: 413 above
 * 512 KB, 400 for any other unreadable upload (no multipart body, another field, several files, a broken body).
 * Interceptors run after the guards, so a request without token, without the role or over its rate limit is
 * refused before its body is read. Errors of the route itself (pipes, handler) are not touched.
 */
@Injectable()
export class PhotoUploadInterceptor implements NestInterceptor {
  private readonly multipart = new MultipartPhoto();

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    try {
      return await this.multipart.intercept(context, next);
    } catch (err) {
      throw err instanceof PayloadTooLargeException
        ? new PayloadTooLargeException(PHOTO_ERRORS.tooLarge)
        : new BadRequestException(PHOTO_ERRORS.missing);
    }
  }
}

/** The file of the field `photo` as the base64 `data` of SetPhotoRequest; 400 without (or with an empty) file. */
export function photoData(file: UploadedPhoto | undefined): string {
  if (!file?.buffer?.length) throw new BadRequestException(PHOTO_ERRORS.missing);
  return file.buffer.toString('base64');
}

/**
 * Writes the JPEG: Cache-Control by `audience` and `version` (the `v` query parameter), a strong ETag (hash of
 * the bytes, the same for the same photo whatever the URL), and 304 without body when If-None-Match names that
 * ETag.
 */
export function sendPhoto(
  res: Response,
  photo: StoredPhoto,
  { audience, version, ifNoneMatch }: { audience: PhotoAudience; version?: string; ifNoneMatch?: string },
): void {
  const bytes = Buffer.from(photo.data, 'base64');
  const etag = photoEtag(bytes);
  res.setHeader('Cache-Control', photoCacheControl(audience, version));
  res.setHeader('ETag', etag);
  if (etagMatches(ifNoneMatch, etag)) {
    res.status(304).end();
    return;
  }
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Content-Length', bytes.length);
  res.status(200).end(bytes);
}

export function photoEtag(bytes: Buffer): string {
  return `"${createHash('sha256').update(bytes).digest('base64url').slice(0, 32)}"`;
}

/** If-None-Match with the weak comparison of RFC 9110: `*`, or one of the listed tags with or without `W/`. */
export function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch.split(',').some((tag) => {
    const value = tag.trim();
    return value === '*' || value.replace(/^W\//, '') === etag;
  });
}

/** Swagger: the multipart body of an upload. */
export const ApiPhotoUpload = () =>
  applyDecorators(
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        required: [PHOTO_FIELD],
        properties: { [PHOTO_FIELD]: { type: 'string', format: 'binary', description: 'JPEG, 512 Ko au plus' } },
      },
    }),
  );

/** Swagger: the image/jpeg answer and its version parameter (`version` says where clients take `v` from). */
export const ApiPhotoDownload = (version = 'Date.parse(photoUpdatedAt)') =>
  applyDecorators(
    ApiOkResponse({
      description: 'La photo (JPEG sans métadonnées), avec Cache-Control et ETag ; 304 si If-None-Match correspond.',
      content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } } },
    }),
    ApiQuery({
      name: 'v',
      type: String,
      required: false,
      description: `${version} : la réponse est alors gardée en cache un an (immutable).`,
    }),
  );
