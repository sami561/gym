import { describe, expect, it, jest } from '@jest/globals';
import {
  base64ByteLength,
  memberPhotoCacheKey,
  memberPhotoSource,
  PHOTO_MAX_BYTES,
  PHOTO_QUALITIES,
  photoFormData,
  photoSizeDecision,
  photoVersion,
  squareCrop,
} from './memberPhoto';

const API_URL = 'https://meliora.example.com';
// MemberDto.photoUpdatedAt as the server sends it, and the `v` it gives (Date.parse, docs/API.md).
const UPDATED_AT = '2026-11-03T10:15:30.120Z';
const VERSION = Date.UTC(2026, 10, 3, 10, 15, 30, 120);
const member = { id: 'member-1', photoUpdatedAt: UPDATED_AT };

describe('photoVersion', () => {
  it('is the upload instant in milliseconds', () => {
    expect(photoVersion(UPDATED_AT)).toBe(VERSION);
    expect(photoVersion('2026-11-03T11:15:30.120+01:00')).toBe(VERSION);
  });

  it('is null without photo or with an unreadable date', () => {
    expect(photoVersion(null)).toBeNull();
    expect(photoVersion('')).toBeNull();
    expect(photoVersion('yesterday')).toBeNull();
  });
});

describe('memberPhotoSource', () => {
  it('loads /api/me/photo?v=<version> with the bearer token, cached under the photo version', () => {
    expect(memberPhotoSource(API_URL, 'access-1', member)).toEqual({
      uri: `${API_URL}/api/me/photo?v=${VERSION}`,
      headers: { Authorization: 'Bearer access-1' },
      cacheKey: `member-photo:member-1:${VERSION}`,
    });
  });

  it('keeps the cache key across token refreshes, so the cached photo is reused', () => {
    const before = memberPhotoSource(API_URL, 'access-1', member);
    const after = memberPhotoSource(API_URL, 'access-2', member);
    expect(after?.headers).toEqual({ Authorization: 'Bearer access-2' });
    expect(after?.cacheKey).toBe(before?.cacheKey);
    expect(after?.uri).toBe(before?.uri);
  });

  it('changes the url and the cache key with every upload', () => {
    const next = memberPhotoSource(API_URL, 'access-1', { ...member, photoUpdatedAt: '2026-11-04T08:00:00.000Z' });
    const current = memberPhotoSource(API_URL, 'access-1', member);
    expect(next?.uri).not.toBe(current?.uri);
    expect(next?.cacheKey).not.toBe(current?.cacheKey);
  });

  it('keeps two members apart in the cache (shared phone)', () => {
    expect(memberPhotoCacheKey({ ...member, id: 'member-2' })).not.toBe(memberPhotoCacheKey(member));
  });

  it('is null without photo or without a session (initials instead)', () => {
    expect(memberPhotoSource(API_URL, 'access-1', { ...member, photoUpdatedAt: null })).toBeNull();
    expect(memberPhotoSource(API_URL, null, member)).toBeNull();
    expect(memberPhotoCacheKey({ ...member, photoUpdatedAt: null })).toBeNull();
  });
});

/** React Native's FormData (the one phones run), whose parts are what the multipart body is built from. */
interface NativeFormData {
  getParts(): unknown[];
}
const { default: ReactNativeFormData } = jest.requireActual<{ default: new () => NativeFormData }>(
  'react-native/Libraries/Network/FormData',
);

describe('photoFormData', () => {
  it('sends the file at the uri as the field "photo", named photo.jpg, typed image/jpeg', async () => {
    jest.spyOn(globalThis, 'FormData').mockImplementation(() => new ReactNativeFormData() as unknown as FormData);
    const uri = 'file:///data/user/0/tn.meliora.gym/cache/ImageManipulator/5b0f.jpg';

    const form = (await photoFormData(uri, 'android')) as unknown as NativeFormData;

    expect(form.getParts()).toEqual([
      {
        uri,
        name: 'photo.jpg',
        type: 'image/jpeg',
        fieldName: 'photo',
        headers: { 'content-disposition': 'form-data; name="photo"; filename="photo.jpg"', 'content-type': 'image/jpeg' },
      },
    ]);
  });

  it('sends a Blob read from the saved file in the web build', async () => {
    const jpeg = new Blob(['jpeg bytes'], { type: 'image/jpeg' });
    const requested: string[] = [];
    globalThis.fetch = (async (url: string | URL) => {
      requested.push(String(url));
      return { blob: async () => jpeg } as Response;
    }) as typeof fetch;

    const form = await photoFormData('blob:http://localhost:8081/5b0f', 'web');

    expect(requested).toEqual(['blob:http://localhost:8081/5b0f']);
    const file = form.get('photo') as File;
    expect(file.name).toBe('photo.jpg');
    expect(file.type).toBe('image/jpeg');
    expect(file.size).toBe(jpeg.size);
  });
});

describe('base64ByteLength', () => {
  it('counts the bytes behind the text, padding included', () => {
    expect(base64ByteLength('')).toBe(0);
    expect(base64ByteLength('TQ==')).toBe(1);
    expect(base64ByteLength('TWE=')).toBe(2);
    expect(base64ByteLength('TWFu')).toBe(3);
    for (const size of [1, 2, 3, 4, 5, 1000, 1001, 1002]) expect(base64ByteLength(btoa('\0'.repeat(size)))).toBe(size);
  });

  it('measures the size limit to the byte', () => {
    expect(base64ByteLength(btoa('\0'.repeat(PHOTO_MAX_BYTES)))).toBe(PHOTO_MAX_BYTES);
    expect(base64ByteLength(btoa('\0'.repeat(PHOTO_MAX_BYTES + 1)))).toBe(PHOTO_MAX_BYTES + 1);
  });

  it('ignores line breaks and a data: URI prefix', () => {
    expect(base64ByteLength('TWFu\nTWFu\r\nTWE=')).toBe(8);
    expect(base64ByteLength('data:image/jpeg;base64,TWFuTWE=')).toBe(5);
  });
});

describe('photoSizeDecision', () => {
  it('sends a photo of 512 KB or less', () => {
    expect(photoSizeDecision(95_000, 0.85)).toEqual({ action: 'send' });
    expect(photoSizeDecision(PHOTO_MAX_BYTES, 0.85)).toEqual({ action: 'send' });
    expect(photoSizeDecision(PHOTO_MAX_BYTES, 0.4)).toEqual({ action: 'send' });
  });

  it('saves a heavier photo again one quality step down, then gives up below the lowest', () => {
    const tooHeavy = PHOTO_MAX_BYTES + 1;
    expect(photoSizeDecision(tooHeavy, 0.85)).toEqual({ action: 'retry', quality: 0.7 });
    expect(photoSizeDecision(tooHeavy, 0.7)).toEqual({ action: 'retry', quality: 0.55 });
    expect(photoSizeDecision(tooHeavy, 0.55)).toEqual({ action: 'retry', quality: 0.4 });
    expect(photoSizeDecision(tooHeavy, 0.4)).toEqual({ action: 'too-large' });
  });

  it('starts at the quality the contract asks for and only goes down', () => {
    expect(PHOTO_QUALITIES[0]).toBe(0.85);
    expect([...PHOTO_QUALITIES].sort((a, b) => b - a)).toEqual([...PHOTO_QUALITIES]);
  });

  it('steps down from a quality outside the list as well', () => {
    expect(photoSizeDecision(PHOTO_MAX_BYTES + 1, 1)).toEqual({ action: 'retry', quality: 0.85 });
    expect(photoSizeDecision(PHOTO_MAX_BYTES + 1, 0.6)).toEqual({ action: 'retry', quality: 0.55 });
  });
});

describe('squareCrop', () => {
  it('keeps the centred square of a landscape or portrait image', () => {
    expect(squareCrop(1000, 800)).toEqual({ originX: 100, originY: 0, width: 800, height: 800 });
    expect(squareCrop(800, 1001)).toEqual({ originX: 0, originY: 100, width: 800, height: 800 });
  });

  it('leaves a square image, or one of unknown size, as it is', () => {
    expect(squareCrop(600, 600)).toBeNull();
    expect(squareCrop(0, 0)).toBeNull();
    expect(squareCrop(0, 600)).toBeNull();
  });
});
