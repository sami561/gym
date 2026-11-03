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
import { MEMBER_PHOTO_ERRORS, MEMBER_PHOTO_MAX_BYTES, MemberPhoto } from '@app/common';

/**
 * Member photos on the HTTP side (docs/API.md, Member photos): staff routes in MembersController, the
 * member's own photo in MeController. membership-service checks the JPEG and removes its metadata.
 */

export const PHOTO_FIELD = 'photo';
/** `?v=<Date.parse(photoUpdatedAt)>` names one version of the photo: cached for a year. */
export const PHOTO_CACHE_VERSIONED = 'private, max-age=31536000, immutable';
/** Without `v` (access logs, scanner): stored, but revalidated with If-None-Match every time. */
export const PHOTO_CACHE_LATEST = 'private, no-cache';

/** The part of multer's file (memory storage) the gateway reads; spares a dependency on @types/multer. */
export interface UploadedPhoto {
  fieldname: string;
  size: number;
  buffer: Buffer;
}

/**
 * multipart/form-data, one file in `photo`, kept in memory; multer stops reading at MEMBER_PHOTO_MAX_BYTES.
 * A few short text fields are tolerated, anything bigger is refused.
 */
const MultipartPhoto = FileInterceptor(PHOTO_FIELD, {
  limits: { fileSize: MEMBER_PHOTO_MAX_BYTES, files: 1, fields: 5, fieldSize: 1024, parts: 6 },
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
        ? new PayloadTooLargeException(MEMBER_PHOTO_ERRORS.tooLarge)
        : new BadRequestException(MEMBER_PHOTO_ERRORS.missing);
    }
  }
}

/** The file of the field `photo` as the base64 `data` of SetMemberPhotoRequest; 400 without (or with an empty) file. */
export function photoData(file: UploadedPhoto | undefined): string {
  if (!file?.buffer?.length) throw new BadRequestException(MEMBER_PHOTO_ERRORS.missing);
  return file.buffer.toString('base64');
}

/**
 * Writes the JPEG: Cache-Control by `version` (the `v` query parameter), a strong ETag (hash of the bytes,
 * the same for the same photo whatever the URL), and 304 without body when If-None-Match names that ETag.
 */
export function sendPhoto(
  res: Response,
  photo: MemberPhoto,
  { version, ifNoneMatch }: { version?: string; ifNoneMatch?: string },
): void {
  const bytes = Buffer.from(photo.data, 'base64');
  const etag = photoEtag(bytes);
  res.setHeader('Cache-Control', version ? PHOTO_CACHE_VERSIONED : PHOTO_CACHE_LATEST);
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

/** Swagger: the image/jpeg answer and its version parameter. */
export const ApiPhotoDownload = () =>
  applyDecorators(
    ApiOkResponse({
      description: 'La photo (JPEG sans métadonnées), avec Cache-Control et ETag ; 304 si If-None-Match correspond.',
      content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } } },
    }),
    ApiQuery({
      name: 'v',
      type: String,
      required: false,
      description: 'Date.parse(photoUpdatedAt) : la réponse est alors gardée en cache un an (immutable).',
    }),
  );
