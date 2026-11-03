import { useRef, useState } from 'react';
import clsx from 'clsx';
import { Spinner } from '../../components/ui/Spinner';
import { useI18n } from '../../i18n';
import { initials } from '../../lib/format';
import { AVATAR_SIZES, AVATAR_TONES, useMemberPhoto, useNearViewport, useObjectUrl, type AvatarSize } from './photos';

interface MemberAvatarProps {
  memberId: string;
  /** Full name: initials and alternative text. */
  name: string;
  /**
   * MemberDto.photoUpdatedAt. null = no photo: initials, nothing is requested. undefined = unknown
   * (access logs, scanner): the latest photo is requested, a 404 means none.
   */
  photoUpdatedAt: string | null | undefined;
  size?: AvatarSize;
  tone?: keyof typeof AVATAR_TONES;
  /** The name is written right next to it: hide the picture from screen readers. */
  decorative?: boolean;
  /** Shows a spinner over the picture, announced with this text (upload in progress). */
  busyLabel?: string;
  className?: string;
}

/** A member's photo fetched with the staff token (never a public URL), or their initials. */
export function MemberAvatar({ memberId, name, photoUpdatedAt, size = 'md', tone = 'plain', decorative = false, busyLabel, className }: MemberAvatarProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLSpanElement>(null);
  // List thumbnails load once on screen; the large portraits load at once.
  const near = useNearViewport(ref, size === 'sm' || size === 'md');
  const photo = useMemberPhoto(memberId, photoUpdatedAt, near);
  const url = useObjectUrl(photo);
  // A file the browser cannot decode falls back to the initials.
  const [broken, setBroken] = useState<string | null>(null);
  // `url` follows `photo` one render late: a deleted photo must not stay up meanwhile.
  const shown = photo != null && url !== null && url !== broken;
  const none = photo === null || (url !== null && url === broken);

  return (
    <span
      ref={ref}
      className={clsx('relative inline-flex shrink-0 items-center justify-center overflow-hidden select-none', AVATAR_SIZES[size], AVATAR_TONES[tone], className)}
    >
      <span
        className="type-wide leading-none"
        {...(decorative || !none ? { 'aria-hidden': true } : { role: 'img', 'aria-label': t('{name}, sans photo', { name }) })}
      >
        {initials(name)}
      </span>
      {shown && (
        <img
          src={url}
          alt={decorative ? '' : t('Photo de {name}', { name })}
          decoding="async"
          draggable={false}
          onError={() => setBroken(url)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      {busyLabel && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-white" role="status" aria-label={busyLabel}>
          <Spinner className="size-6" />
        </span>
      )}
    </span>
  );
}
