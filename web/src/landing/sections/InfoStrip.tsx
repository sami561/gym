import { Clock, MapPin, QrCode } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { todayHours, useGym } from '../useLandingData';

/** Practical information under the hero, on the facade's corrugated steel. */
export function InfoStrip() {
  const { t } = useI18n();
  const { gym } = useGym();
  const hours = todayHours(gym.openingHours);
  const items = [
    { icon: Clock, label: t('hero.open'), value: hours ?? '—' },
    { icon: MapPin, label: gym.address, value: gym.city },
    { icon: QrCode, label: t('facts.access'), value: t('facts.classes') },
  ];
  return (
    <section aria-label={t('a11y.info')} className="bg-corrugated border-y border-white/10 text-white">
      <ul className="mx-auto grid max-w-7xl grid-cols-1 divide-y divide-white/10 px-5 sm:px-8 md:grid-cols-3 md:divide-x md:divide-y-0">
        {items.map(({ icon: Icon, label, value }) => (
          <li key={label} className="flex items-center gap-4 py-5 md:px-6 md:first:ps-0">
            <Icon className="size-5 shrink-0 text-led" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm text-steel-300">{label}</p>
              <p className="truncate font-semibold">{value}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
