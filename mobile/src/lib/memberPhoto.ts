import { Platform } from 'react-native';
import type { ImageSource } from 'expo-image';

/*
 * Member photo (docs/API.md, "Member photos"): one JPEG per member, shown on the profile and on the pass, where
 * the front desk checks the member's identity. Pure helpers; src/lib/preparePhoto.ts resizes the picked image.
 */

/** The server keeps a 600×600 square: the app resizes to it before sending. */
export const PHOTO_SIZE = 600;

/** Largest upload accepted (413 `La photo dépasse 512 Ko.` above). */
export const PHOTO_MAX_BYTES = 512 * 1024;

/** JPEG qualities tried in turn until the file fits PHOTO_MAX_BYTES (600×600 at 0.85 weighs ~100 KB). */
export const PHOTO_QUALITIES = [0.85, 0.7, 0.55, 0.4] as const;

/** The multipart file field of PUT /api/me/photo, and the file name and type sent with it. */
export const PHOTO_FIELD = 'photo';
export const PHOTO_FILE = { name: 'photo.jpg', type: 'image/jpeg' } as const;

export interface PhotoOwner {
  id: string;
  /** MemberDto.photoUpdatedAt: ISO instant of the last upload, null without photo. */
  photoUpdatedAt: string | null;
}

/** The `v` of …/photo?v=: Date.parse(photoUpdatedAt). Null without photo or when the date cannot be read. */
export function photoVersion(photoUpdatedAt: string | null): number | null {
  if (!photoUpdatedAt) return null;
  const version = Date.parse(photoUpdatedAt);
  return Number.isFinite(version) ? version : null;
}

/** expo-image cache key of one version of a member's photo: every upload gets its own. */
export function memberPhotoCacheKey(member: PhotoOwner): string | null {
  const version = photoVersion(member.photoUpdatedAt);
  return version === null ? null : `member-photo:${member.id}:${version}`;
}

/**
 * expo-image source of the signed-in member's own photo: GET /api/me/photo?v=… with the bearer token (photos are
 * never public). The cache key follows the photo version, not the token, so the photo stays cached across token
 * refreshes and offline. Null without photo or without a session.
 */
export function memberPhotoSource(apiUrl: string, accessToken: string | null, member: PhotoOwner): ImageSource | null {
  const version = photoVersion(member.photoUpdatedAt);
  const cacheKey = memberPhotoCacheKey(member);
  if (!accessToken || version === null || !cacheKey) return null;
  return {
    uri: `${apiUrl}/api/me/photo?v=${version}`,
    headers: { Authorization: `Bearer ${accessToken}` },
    cacheKey,
  };
}

/**
 * Body of PUT /api/me/photo: the JPEG at `uri` as the file field `photo`. React Native streams the file from its
 * uri; a browser (web dev build) only sends Blobs, read here from the blob: URI expo-image-manipulator saved.
 */
export async function photoFormData(uri: string, os: typeof Platform.OS = Platform.OS): Promise<FormData> {
  const form = new FormData();
  if (os === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append(PHOTO_FIELD, blob, PHOTO_FILE.name);
  } else {
    // React Native's FormData takes { uri, name, type } file parts; the DOM typing only knows Blob.
    form.append(PHOTO_FIELD, { uri, ...PHOTO_FILE } as unknown as Blob);
  }
  return form;
}

/** Bytes encoded by a base64 string (an optional data: URI prefix and line breaks ignored). */
export function base64ByteLength(base64: string): number {
  const data = base64.replace(/^data:[^,]*,/, '').replace(/\s/g, '');
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}

/** What to do with a JPEG saved at `quality` that weighs `bytes`. */
export type PhotoSizeDecision = { action: 'send' } | { action: 'retry'; quality: number } | { action: 'too-large' };

/** Send it when it fits; otherwise save again at the next quality down, until even the lowest one is too heavy. */
export function photoSizeDecision(bytes: number, quality: number): PhotoSizeDecision {
  if (bytes <= PHOTO_MAX_BYTES) return { action: 'send' };
  const lower = PHOTO_QUALITIES.find((candidate) => candidate < quality);
  return lower === undefined ? { action: 'too-large' } : { action: 'retry', quality: lower };
}

/**
 * Centred square of a width × height image, null when it is square already (or its size is unknown). The picker's
 * crop is square in principle, but the web picker has none and iOS returns a wrong crop for some large images.
 */
export function squareCrop(
  width: number,
  height: number,
): { originX: number; originY: number; width: number; height: number } | null {
  if (!(width > 0 && height > 0) || width === height) return null;
  const side = Math.floor(Math.min(width, height));
  return { originX: Math.floor((width - side) / 2), originY: Math.floor((height - side) / 2), width: side, height: side };
}
