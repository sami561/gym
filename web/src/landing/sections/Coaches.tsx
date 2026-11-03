import { useState } from 'react';
import { apiFileUrl } from '../../api/client';
import { useI18n } from '../../lib/i18n';
import { initials } from '../../lib/format';
import { usePublicCoaches } from '../useLandingData';

/**
 * The coach's photo: avatarUrl is the public `/api/public/coaches/:id/photo?v=…` uploaded from the
 * back office (a 600×600 square), or an older address typed by hand. Initials when there is none or
 * it does not load. Decorative: the name is the heading next to it.
 */
function CoachPortrait({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const src = avatarUrl ? apiFileUrl(avatarUrl) : null;
  const [broken, setBroken] = useState<string | null>(null);
  if (src && src !== broken) {
    return (
      <img
        src={src}
        alt=""
        width={80}
        height={80}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(src)}
        className="size-20 shrink-0 rounded-full bg-steel-800 object-cover ring-1 ring-white/15"
      />
    );
  }
  return (
    <span className="type-wide flex size-20 shrink-0 items-center justify-center rounded-full bg-steel-800 text-xl text-led ring-1 ring-white/10" aria-hidden>
      {initials(name)}
    </span>
  );
}

export function Coaches() {
  const { t } = useI18n();
  const query = usePublicCoaches();
  const coaches = query.data ?? [];

  return (
    <section className="bg-shield py-24 text-white sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <h2 className="type-display text-5xl sm:text-6xl">{t('coaches.title')}</h2>
        {coaches.length === 0 ? (
          <p className="mt-8 max-w-xl text-lg text-steel-300">{t('coaches.empty')}</p>
        ) : (
          <ul className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {coaches.map((coach) => {
              const name = `${coach.firstName} ${coach.lastName}`;
              return (
                <li key={coach.id} className="flex gap-5">
                  <CoachPortrait name={name} avatarUrl={coach.avatarUrl} />
                  <div>
                    <h3 className="type-wide text-xl">{name}</h3>
                    {coach.specialty && <p className="mt-1 text-sm font-semibold text-brand-400">{coach.specialty}</p>}
                    {coach.bio && <p className="mt-2 text-sm leading-relaxed text-steel-300">{coach.bio}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
