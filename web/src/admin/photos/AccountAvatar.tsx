import { useState } from 'react';
import clsx from 'clsx';
import { apiFileUrl } from '../../api/client';
import { useI18n } from '../../i18n';
import { initials } from '../../lib/format';
import { AVATAR_SIZES, AVATAR_TONES, type AvatarSize } from './photos';

interface AccountAvatarProps {
  /** Full name: initials and alternative text. */
  name: string;
  /** UserDto.avatarUrl: the uploaded coach photo, or an address typed by hand before uploads existed. */
  url: string | null;
  size?: AvatarSize;
  /** The name is written right next to it: hide the picture from screen readers. */
  decorative?: boolean;
  className?: string;
}

/**
 * A team account's photo, or its initials. Coach photos are public (the website shows them), so a
 * plain <img> loads them, unlike member photos (MemberAvatar). An address that does not load falls
 * back to the initials.
 */
export function AccountAvatar({ name, url, size = 'md', decorative = false, className }: AccountAvatarProps) {
  const { t } = useI18n();
  const src = url ? apiFileUrl(url) : null;
  const [broken, setBroken] = useState<string | null>(null);
  const shown = src !== null && src !== broken;

  return (
    <span className={clsx('relative inline-flex shrink-0 items-center justify-center overflow-hidden select-none', AVATAR_SIZES[size], AVATAR_TONES.plain, className)}>
      <span
        className="type-wide leading-none"
        {...(decorative || shown ? { 'aria-hidden': true } : { role: 'img', 'aria-label': t('{name}, sans photo', { name }) })}
      >
        {initials(name)}
      </span>
      {shown && (
        <img
          src={src}
          alt={decorative ? '' : t('Photo de {name}', { name })}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setBroken(src)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  );
}
