import { Activity, Dumbbell, HeartPulse, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n, type TranslationKey } from '../../lib/i18n';
import { ROOM_TYPE_LABELS } from '../../lib/labels-ops';
import { usePublicRooms } from '../useLandingData';

const FALLBACK: { icon: LucideIcon; title: TranslationKey; text: TranslationKey }[] = [
  { icon: Dumbbell, title: 'facilities.weights', text: 'facilities.weightsText' },
  { icon: HeartPulse, title: 'facilities.cardio', text: 'facilities.cardioText' },
  { icon: Users, title: 'facilities.classes', text: 'facilities.classesText' },
  { icon: Activity, title: 'facilities.coaching', text: 'facilities.coachingText' },
];

export function Spaces() {
  const { t } = useI18n();
  const rooms = usePublicRooms();
  const list = rooms.data?.filter((room) => room.isActive && room.type !== 'ACCUEIL' && room.type !== 'VESTIAIRE');

  return (
    <section className="bg-steel-950 py-24 text-white sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2 className="type-display text-5xl sm:text-6xl">{t('facilities.title')}</h2>
          <figure className="mt-10 flex items-end gap-5">
            {/* The source photo is tiny (141×235): shown at its natural size. */}
            <img src="/images/interior.jpg" alt={t('spaces.imageAlt')} width={141} height={235} loading="lazy" className="rounded-lg ring-1 ring-white/15" />
            <figcaption className="max-w-[22ch] text-sm text-steel-400">{t('spaces.caption')}</figcaption>
          </figure>
        </div>

        <ul className="divide-y divide-white/10 border-y border-white/10">
          {list && list.length > 0
            ? list.map((room) => (
                <li key={room.id} className="grid gap-2 py-7 sm:grid-cols-[1fr_auto] sm:gap-8">
                  <div>
                    <h3 className="type-wide text-2xl">{room.name}</h3>
                    <p className="mt-1 text-sm text-steel-400">{t(ROOM_TYPE_LABELS[room.type])}{room.floor ? `, ${room.floor}` : ''}</p>
                    {room.description && <p className="mt-3 max-w-[60ch] text-steel-200">{room.description}</p>}
                  </div>
                  <p className="text-steel-300 sm:text-end">
                    <span className="type-wide text-3xl text-white tabular">{room.capacity}</span> {t('facilities.capacity')}
                  </p>
                </li>
              ))
            : FALLBACK.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-5 py-7">
                  <Icon className="mt-1 size-6 shrink-0 text-led" aria-hidden />
                  <div>
                    <h3 className="type-wide text-2xl">{t(title)}</h3>
                    <p className="mt-2 max-w-[60ch] text-steel-300">{t(text)}</p>
                  </div>
                </li>
              ))}
        </ul>
      </div>
    </section>
  );
}
