/**
 * Photos uploaded as files (docs/API.md, Member photos and Coach photos): one JPEG of at most PHOTO_MAX_BYTES,
 * stored without its metadata segments (utils/jpeg-metadata.ts) by the service that owns the person
 * (membership-service for members, auth-service for coaches). The bytes are personal data: never logged,
 * never in an event.
 */

/** JPEG only, at most 512 KB, checked by the gateway (multer limit) and again by the service. */
export const PHOTO_MAX_BYTES = 512 * 1024;

/** The refusals of docs/API.md: the same text from the gateway and from the services, for every photo route. */
export const PHOTO_ERRORS = {
  /** 400: no file in the field `photo`, or a multipart body that cannot be read. */
  missing: 'Ajoutez une photo (champ « photo »).',
  /** 400: the bytes are not a well-formed JPEG, whatever the declared type. */
  notJpeg: 'La photo doit être une image JPEG.',
  /** 413: more than PHOTO_MAX_BYTES. */
  tooLarge: 'La photo dépasse 512 Ko.',
  /** 404 on GET: no stored photo (or, for a coach, not shown on the website). */
  none: 'Aucune photo.',
} as const;

/** `members.photo.set`, `users.photo.set` — `data` is the uploaded file, base64. */
export interface SetPhotoRequest {
  id: string;
  data: string;
}

/** `members.photo.get`, `users.photo.get` — the stored (cleaned) JPEG, base64. */
export interface StoredPhoto {
  data: string;
  contentType: 'image/jpeg';
  /** ISO instant of the upload. */
  updatedAt: string;
}
