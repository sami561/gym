import type { MessageKey } from '../i18n/messages';

/*
 * Member photos are prepared in the browser before upload (docs/API.md, "Member photos"): decoded
 * upright (EXIF orientation applied), centre square, 600×600 JPEG at quality 0.85, lowered until the
 * file fits in the server's 512 KB limit.
 */
export const PHOTO_SIZE = 600;
export const PHOTO_MAX_BYTES = 512 * 1024;
/** JPEG qualities tried in turn until the file fits in PHOTO_MAX_BYTES. */
export const PHOTO_QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45];

export type PhotoErrorCode = 'unreadable' | 'too-large' | 'unsupported' | 'not-ready';

export const PHOTO_ERROR_MESSAGES: Record<PhotoErrorCode, MessageKey> = {
  unreadable: 'Ce fichier n’est pas une image lisible. Choisissez une photo JPEG, PNG ou WebP.',
  'too-large': 'La photo reste trop lourde après compression. Essayez une autre photo.',
  unsupported: 'Ce navigateur ne peut pas préparer la photo. Mettez-le à jour, puis réessayez.',
  'not-ready': 'La caméra n’est pas encore prête. Réessayez dans un instant.',
};

/** A photo that could not be prepared; `code` picks the advice shown (PHOTO_ERROR_MESSAGES). */
export class PhotoError extends Error {
  readonly code: PhotoErrorCode;

  constructor(code: PhotoErrorCode) {
    super(PHOTO_ERROR_MESSAGES[code]);
    this.name = 'PhotoError';
    this.code = code;
  }
}

/** The centred square of a width × height picture: the part that is kept. */
export function centerSquare(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  return { sx: (width - side) / 2, sy: (height - side) / 2, side };
}

/** A picked file (phone photo, scan, screenshot): decoded upright, cropped, resized and encoded. */
export async function preparePhoto(file: Blob): Promise<Blob> {
  const bitmap = await decode(file);
  try {
    return await toSquareJpeg(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/** The frame a playing <video> shows (webcam), with the same crop and encoding. */
export async function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  if (!video.videoWidth || !video.videoHeight) throw new PhotoError('not-ready');
  return toSquareJpeg(video, video.videoWidth, video.videoHeight);
}

async function decode(file: Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== 'function') throw new PhotoError('unsupported');
  try {
    // Phones often store photos sideways with an EXIF orientation tag: decode them upright.
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (error) {
    // Browsers that predate the 'from-image' value reject the option itself: decode without it.
    if (error instanceof TypeError) {
      try {
        return await createImageBitmap(file);
      } catch {
        /* not an image this browser can read */
      }
    }
    throw new PhotoError('unreadable');
  }
}

async function toSquareJpeg(image: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new PhotoError('unsupported');
  const { sx, sy, side } = centerSquare(width, height);
  // JPEG has no transparency: a transparent PNG gets white behind it instead of black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, sx, sy, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  for (const quality of PHOTO_QUALITIES) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    // A browser that cannot write JPEG falls back to PNG, which the server refuses.
    if (!blob || blob.type !== 'image/jpeg') throw new PhotoError('unsupported');
    if (blob.size <= PHOTO_MAX_BYTES) return blob;
  }
  throw new PhotoError('too-large');
}
