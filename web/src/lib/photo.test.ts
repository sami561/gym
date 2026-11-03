// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { captureFrame, centerSquare, PHOTO_ERROR_MESSAGES, PHOTO_MAX_BYTES, PhotoError, preparePhoto, type PhotoErrorCode } from './photo';

/** Stand-in for <canvas> (jsdom draws nothing): records the drawing; the JPEG size depends on the quality. */
class FakeCanvas {
  width = 0;
  height = 0;
  readonly draws: unknown[][] = [];
  readonly qualities: number[] = [];
  /** Size of the JPEG written at a quality. */
  bytesAt: (quality: number) => number = () => 60_000;
  /** What the browser writes; one that cannot encode JPEG falls back to PNG. */
  encodes = 'image/jpeg';
  readonly context = {
    fillStyle: '',
    imageSmoothingQuality: 'low',
    fillRect: vi.fn(),
    drawImage: (...args: unknown[]) => {
      this.draws.push(args);
    },
  };

  getContext(kind: string) {
    return kind === '2d' ? this.context : null;
  }

  toBlob(callback: BlobCallback, type: string, quality: number) {
    expect(type).toBe('image/jpeg');
    this.qualities.push(quality);
    callback(new Blob([new Uint8Array(this.bytesAt(quality))], { type: this.encodes }));
  }
}

let canvas: FakeCanvas;
let decode: Mock<(file: Blob, options?: ImageBitmapOptions) => Promise<ImageBitmap>>;
const file = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });

/** createImageBitmap decodes the file as a picture of this size (already upright). */
function decodesAs(width: number, height: number) {
  const bitmap = { width, height, close: vi.fn() };
  decode = vi.fn(async () => bitmap as unknown as ImageBitmap);
  vi.stubGlobal('createImageBitmap', decode);
  return bitmap;
}

async function photoError(promise: Promise<unknown>): Promise<PhotoErrorCode> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(PhotoError);
  return (error as PhotoError).code;
}

beforeEach(() => {
  canvas = new FakeCanvas();
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => (tag === 'canvas' ? canvas : create(tag))) as typeof document.createElement);
});

describe('centerSquare', () => {
  it('keeps the middle of landscape and portrait pictures', () => {
    expect(centerSquare(1280, 720)).toEqual({ sx: 280, sy: 0, side: 720 });
    expect(centerSquare(3000, 4000)).toEqual({ sx: 0, sy: 500, side: 3000 });
    expect(centerSquare(600, 600)).toEqual({ sx: 0, sy: 0, side: 600 });
  });
});

describe('preparePhoto', () => {
  it('decodes the file upright, crops the centre square and scales it to a 600×600 JPEG at quality 0.85', async () => {
    const bitmap = decodesAs(4000, 3000);

    const photo = await preparePhoto(file);

    expect(decode).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
    expect([canvas.width, canvas.height]).toEqual([600, 600]);
    expect(canvas.draws).toEqual([[bitmap, 500, 0, 3000, 3000, 0, 0, 600, 600]]);
    expect(canvas.qualities).toEqual([0.85]);
    expect(photo.type).toBe('image/jpeg');
    expect(photo.size).toBe(60_000);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('keeps the middle of a portrait photo', async () => {
    const bitmap = decodesAs(3024, 4032);
    await preparePhoto(file);
    expect(canvas.draws).toEqual([[bitmap, 0, 504, 3024, 3024, 0, 0, 600, 600]]);
  });

  it('brings a small picture to the same 600×600 square', async () => {
    const bitmap = decodesAs(320, 240);
    await preparePhoto(file);
    expect(canvas.draws).toEqual([[bitmap, 40, 0, 240, 240, 0, 0, 600, 600]]);
  });

  it('paints white under the picture, since JPEG has no transparency (PNG logos, screenshots)', async () => {
    decodesAs(800, 800);
    await preparePhoto(file);
    expect(canvas.context.fillStyle).toBe('#ffffff');
    expect(canvas.context.fillRect).toHaveBeenCalledWith(0, 0, 600, 600);
  });

  it('lowers the quality until the photo fits in 512 KB', async () => {
    decodesAs(4000, 3000);
    canvas.bytesAt = (quality) => (quality > 0.7 ? 600_000 : 400_000);

    const photo = await preparePhoto(file);

    expect(canvas.qualities).toEqual([0.85, 0.75, 0.65]);
    expect(photo.size).toBe(400_000);
  });

  it('accepts a photo of exactly 512 KB', async () => {
    decodesAs(4000, 3000);
    canvas.bytesAt = () => PHOTO_MAX_BYTES;
    expect((await preparePhoto(file)).size).toBe(512 * 1024);
    expect(canvas.qualities).toEqual([0.85]);
  });

  it('gives up when even the lowest quality is over 512 KB', async () => {
    const bitmap = decodesAs(4000, 3000);
    canvas.bytesAt = () => PHOTO_MAX_BYTES + 1;

    expect(await photoError(preparePhoto(file))).toBe('too-large');
    expect(canvas.qualities).toEqual([0.85, 0.75, 0.65, 0.55, 0.45]);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('refuses a file the browser cannot decode (PDF, HEIC outside Safari)', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new DOMException('The source image could not be decoded.', 'InvalidStateError');
      }),
    );
    expect(await photoError(preparePhoto(file))).toBe('unreadable');
    expect(canvas.draws).toEqual([]);
  });

  it('decodes without the orientation option in browsers that reject its value', async () => {
    const bitmap = { width: 900, height: 600, close: vi.fn() };
    decode = vi
      .fn<(file: Blob, options?: ImageBitmapOptions) => Promise<ImageBitmap>>()
      .mockRejectedValueOnce(new TypeError("The provided value 'from-image' is not a valid enum value of type ImageOrientation."))
      .mockResolvedValueOnce(bitmap as unknown as ImageBitmap);
    vi.stubGlobal('createImageBitmap', decode);

    await preparePhoto(file);

    expect(decode.mock.calls).toEqual([[file, { imageOrientation: 'from-image' }], [file]]);
    expect(canvas.draws).toEqual([[bitmap, 150, 0, 600, 600, 0, 0, 600, 600]]);
  });

  it('says the browser cannot do it without createImageBitmap or a JPEG encoder', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    expect(await photoError(preparePhoto(file))).toBe('unsupported');

    decodesAs(800, 600);
    canvas.encodes = 'image/png';
    expect(await photoError(preparePhoto(file))).toBe('unsupported');
  });

  it('carries the French advice as its message, for code that only reads error.message', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    const error = await preparePhoto(file).catch((reason: unknown) => reason);
    expect((error as Error).message).toBe(PHOTO_ERROR_MESSAGES.unsupported);
  });
});

describe('captureFrame', () => {
  it('saves the centre square of the webcam frame, as the square preview shows it', async () => {
    const video = { videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement;

    const photo = await captureFrame(video);

    expect(canvas.draws).toEqual([[video, 280, 0, 720, 720, 0, 0, 600, 600]]);
    expect(canvas.qualities).toEqual([0.85]);
    expect(photo.type).toBe('image/jpeg');
  });

  it('waits for the first frame of the camera', async () => {
    expect(await photoError(captureFrame({ videoWidth: 0, videoHeight: 0 } as HTMLVideoElement))).toBe('not-ready');
    expect(canvas.draws).toEqual([]);
  });
});
