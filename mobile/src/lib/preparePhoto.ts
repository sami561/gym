import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { base64ByteLength, PHOTO_QUALITIES, PHOTO_SIZE, photoSizeDecision, squareCrop } from './memberPhoto';

/** Decoding limit for camera photos (12 to 48 MP): plenty for a 600 px square, and far less memory. */
const DECODE_MAX = 2048;

export class PhotoTooLargeError extends Error {
  constructor() {
    super('photo-too-large');
    this.name = 'PhotoTooLargeError';
  }
}

/**
 * The picked image as the server stores it (docs/API.md, "Member photos"): centred square, 600×600, JPEG at the
 * first PHOTO_QUALITIES step that fits 512 KB. Re-encoding applies the orientation and leaves the EXIF block
 * (GPS position, camera) behind. Resolves to the local file uri; PhotoTooLargeError when nothing fits.
 */
export async function preparePhoto(uri: string): Promise<string> {
  // Native images and contexts hold bitmaps: release them all once the file is written.
  const owned: { release(): void }[] = [];
  const own = <T extends { release(): void }>(object: T): T => {
    owned.push(object);
    return object;
  };
  try {
    const loading = own(ImageManipulator.manipulate(uri, { maxWidth: DECODE_MAX, maxHeight: DECODE_MAX }));
    const decoded = own(await loading.renderAsync());
    const editing = own(ImageManipulator.manipulate(decoded));
    const crop = squareCrop(decoded.width, decoded.height);
    if (crop) editing.crop(crop);
    const square = own(await editing.resize({ width: PHOTO_SIZE, height: PHOTO_SIZE }).renderAsync());

    let quality: number = PHOTO_QUALITIES[0];
    for (;;) {
      const saved = await square.saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: true });
      // Without base64 (not expected) the size is unknown: the server has the last word (413).
      const next = photoSizeDecision(saved.base64 ? base64ByteLength(saved.base64) : 0, quality);
      if (next.action === 'send') return saved.uri;
      if (next.action === 'too-large') throw new PhotoTooLargeError();
      quality = next.quality;
    }
  } finally {
    for (const object of owned.reverse()) object.release();
  }
}
