import { useI18n } from '../../lib/i18n';
import { initials } from '../../lib/format';
import { usePublicCoaches } from '../useLandingData';

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
                  {coach.avatarUrl ? (
                    <img src={coach.avatarUrl} alt="" loading="lazy" className="size-20 shrink-0 rounded-full object-cover ring-1 ring-white/15" />
                  ) : (
                    <span className="type-wide flex size-20 shrink-0 items-center justify-center rounded-full bg-steel-800 text-xl text-led ring-1 ring-white/10" aria-hidden>
                      {initials(name)}
                    </span>
                  )}
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
