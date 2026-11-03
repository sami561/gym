import { useEffect, useState, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError, errorMessage } from '../../api/client';
import { membersApi } from '../../api/endpoints';
import type { TFunction } from '../../i18n';
import { PHOTO_ERROR_MESSAGES, PhotoError } from '../../lib/photo';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

/** Square like the stored photo, corners rounding up with the size: an access-badge portrait. */
export const AVATAR_SIZES: Record<AvatarSize, string> = {
  /** Live feed, access log. */
  sm: 'size-8 rounded-md text-[11px]',
  /** Member list, team list. */
  md: 'size-10 rounded-lg text-[13px]',
  /** Member file, photo picker of the new member and coach forms. */
  lg: 'size-20 rounded-xl text-2xl sm:size-28 sm:rounded-2xl sm:text-3xl',
  /** Reception scanner: big enough to compare with the face at the desk. */
  xl: 'size-28 rounded-2xl text-4xl sm:size-44 sm:rounded-3xl sm:text-6xl lg:size-48 xl:size-56',
};

export const AVATAR_TONES = {
  plain: 'bg-card-2 text-fg-2 ring-1 ring-line',
  /** On the scanner's green or red verdict. */
  verdict: 'bg-white/15 text-white ring-4 ring-white/90',
};

/**
 * Cache key of a member's photo: one entry per upload (`version`), and 'latest' where only the
 * member id is known (access logs, live feed, scanner). memberPhotoKey(id, undefined) is the latest.
 */
export function memberPhotoKey(memberId: string, version?: number) {
  return ['member-photo', memberId, version ?? 'latest'] as const;
}

/** `v` of the photo URL: Date.parse(photoUpdatedAt), undefined when unknown. */
export function photoVersion(photoUpdatedAt: string | null | undefined): number | undefined {
  const time = photoUpdatedAt ? Date.parse(photoUpdatedAt) : Number.NaN;
  return Number.isFinite(time) ? time : undefined;
}

async function fetchPhoto(memberId: string, version: number | undefined, signal: AbortSignal): Promise<Blob | null> {
  try {
    return await membersApi.photo(memberId, version, signal);
  } catch (error) {
    // 404: no photo (or no such member) — show the initials, and remember it like an answer.
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * A member's photo as a Blob (react-query cache): `null` when there is none, `undefined` while
 * unknown. photoUpdatedAt from a MemberDto: null = no photo, nothing is requested; undefined =
 * unknown, the latest photo is requested and a 404 means none.
 */
export function useMemberPhoto(memberId: string, photoUpdatedAt: string | null | undefined, enabled = true): Blob | null | undefined {
  const version = photoVersion(photoUpdatedAt);
  const query = useQuery({
    queryKey: memberPhotoKey(memberId, version),
    queryFn: ({ signal }) => fetchPhoto(memberId, version, signal),
    enabled: enabled && Boolean(memberId) && photoUpdatedAt !== null,
    // A versioned photo never changes; the latest one is downloaded again after a minute (no HTTP cache).
    staleTime: version === undefined ? 60_000 : Infinity,
    // After an upload, keep the previous photo of the same member on screen until the new one loads.
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === memberId ? previous : undefined),
  });
  return photoUpdatedAt === null ? null : query.data;
}

/** An object URL for the blob, revoked when the blob changes or the component unmounts. */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return undefined;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url;
}

/**
 * True once the element comes within `margin` of the viewport, then stays true: long lists only
 * download the photos of the rows on screen. Always true when `lazy` is off or without
 * IntersectionObserver.
 */
export function useNearViewport(ref: RefObject<Element | null>, lazy = true, margin = '200px'): boolean {
  const [near, setNear] = useState(() => !lazy || typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const element = ref.current;
    if (near || !element) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setNear(true);
        observer.disconnect();
      },
      { rootMargin: margin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, near, margin]);
  return near;
}

/** Why a photo could not be prepared or saved: the advice for a PhotoError, else the API's message. */
export function photoErrorText(error: unknown, t: TFunction): string {
  return error instanceof PhotoError ? t(PHOTO_ERROR_MESSAGES[error.code]) : errorMessage(error);
}
